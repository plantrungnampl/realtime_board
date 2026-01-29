use std::collections::HashSet;

use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    dto::comments::{
        CommentListResponse, CommentPagination, CommentResponse, CommentUserResponse,
        CreateCommentRequest, ListCommentsQuery,
    },
    error::AppError,
    repositories::{
        comments as comment_repo, comments::CommentCursor, comments::CreateCommentParams,
        elements as element_repo, notifications as notification_repo,
    },
    telemetry::BusinessEvent,
    usecases::boards::BoardService,
};

pub struct CommentService;

const MIN_COMMENT_LENGTH: usize = 1;
const MAX_COMMENT_LENGTH: usize = 5000;
const MAX_COMMENT_MENTIONS: usize = 20;
const DEFAULT_COMMENT_PAGE_SIZE: u32 = 50;
const MAX_COMMENT_PAGE_SIZE: u32 = 200;

impl CommentService {
    pub async fn create_comment(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
        req: CreateCommentRequest,
    ) -> Result<CommentResponse, AppError> {
        BoardService::ensure_can_comment(pool, board_id, user_id).await?;

        let content = normalize_comment_content(&req.content)?;
        let mentions = normalize_mentions(req.mentions)?;
        let mentions = comment_repo::filter_mentions(pool, board_id, &mentions).await?;
        let notify_mentions = mentions
            .iter()
            .copied()
            .filter(|target_id| *target_id != user_id)
            .collect::<Vec<_>>();
        if let Some(element_id) = req.element_id {
            let exists = element_repo::find_element_by_id(pool, board_id, element_id).await?;
            if exists.is_none() {
                return Err(AppError::NotFound("Element not found".to_string()));
            }
        }

        let (position_x, position_y) =
            validate_position(req.element_id, req.position_x, req.position_y)?;

        let mut tx = pool.begin().await?;
        let row = comment_repo::create_comment(
            &mut tx,
            CreateCommentParams {
                board_id,
                element_id: req.element_id,
                parent_id: None,
                created_by: user_id,
                position_x,
                position_y,
                content,
                content_html: req.content_html,
                mentions,
            },
        )
        .await?;
        let notify_mentions_for_event = notify_mentions.clone();
        if !notify_mentions.is_empty() {
            let notification_body = build_notification_body(&row.content);
            notification_repo::create_comment_mentions(
                &mut tx,
                notification_repo::CreateCommentMentionNotifications {
                    user_ids: notify_mentions,
                    actor_id: user_id,
                    board_id,
                    element_id: row.element_id,
                    comment_id: row.id,
                    title: "Mentioned in a comment".to_string(),
                    body: notification_body,
                    data: serde_json::json!({
                        "comment_id": row.id,
                        "board_id": board_id,
                        "element_id": row.element_id,
                    }),
                },
            )
            .await?;
        }
        tx.commit().await?;

        BusinessEvent::CommentCreated {
            comment_id: row.id,
            board_id,
            element_id: row.element_id,
            actor_id: user_id,
        }
        .log();
        if !notify_mentions_for_event.is_empty() {
            BusinessEvent::CommentMentioned {
                comment_id: row.id,
                board_id,
                actor_id: user_id,
                mentioned_user_ids: notify_mentions_for_event,
            }
            .log();
        }

        Ok(map_comment_response(row))
    }

    pub async fn list_comments(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
        query: ListCommentsQuery,
    ) -> Result<CommentListResponse, AppError> {
        BoardService::ensure_can_view(pool, board_id, user_id).await?;

        let limit = normalize_comment_limit(query.limit)?;
        let cursor = parse_cursor(query.cursor.as_deref())?;
        let query_limit = limit as i64 + 1;
        let rows = comment_repo::list_comments(
            pool,
            board_id,
            query.element_id,
            query.parent_id,
            query.status,
            cursor,
            query_limit,
        )
        .await?;
        let (data, pagination) = build_comment_page(rows, limit);

        Ok(CommentListResponse { data, pagination })
    }
}

fn normalize_comment_content(content: &str) -> Result<String, AppError> {
    let trimmed = content.trim();
    let len = trimmed.chars().count();
    if len < MIN_COMMENT_LENGTH {
        return Err(AppError::ValidationError(
            "Comment content is required".to_string(),
        ));
    }
    if len > MAX_COMMENT_LENGTH {
        return Err(AppError::ValidationError(format!(
            "Comment content exceeds {MAX_COMMENT_LENGTH} characters"
        )));
    }
    Ok(trimmed.to_string())
}

fn normalize_mentions(mentions: Option<Vec<Uuid>>) -> Result<Vec<Uuid>, AppError> {
    let list = mentions.unwrap_or_default();
    let mut unique = HashSet::new();
    let mut result = Vec::new();
    for user_id in list {
        if unique.insert(user_id) {
            result.push(user_id);
        }
    }
    if result.len() > MAX_COMMENT_MENTIONS {
        return Err(AppError::ValidationError(format!(
            "Comment mentions limit exceeded (max {MAX_COMMENT_MENTIONS})"
        )));
    }
    Ok(result)
}

fn build_notification_body(content: &str) -> String {
    const MAX_BODY_CHARS: usize = 160;
    let trimmed = content.trim();
    if trimmed.chars().count() <= MAX_BODY_CHARS {
        return trimmed.to_string();
    }
    let mut shortened = String::new();
    for (idx, ch) in trimmed.chars().enumerate() {
        if idx >= MAX_BODY_CHARS {
            break;
        }
        shortened.push(ch);
    }
    shortened.push('…');
    shortened
}

fn normalize_comment_limit(limit: Option<u32>) -> Result<u32, AppError> {
    let value = limit.unwrap_or(DEFAULT_COMMENT_PAGE_SIZE);
    if value == 0 {
        return Err(AppError::ValidationError(
            "Comment limit must be greater than zero".to_string(),
        ));
    }
    if value > MAX_COMMENT_PAGE_SIZE {
        return Err(AppError::ValidationError(format!(
            "Comment limit exceeds maximum of {MAX_COMMENT_PAGE_SIZE}"
        )));
    }
    Ok(value)
}

fn parse_cursor(cursor: Option<&str>) -> Result<Option<CommentCursor>, AppError> {
    let Some(cursor) = cursor else {
        return Ok(None);
    };
    let mut parts = cursor.split('|');
    let ts_part = parts.next().unwrap_or_default();
    let id_part = parts.next().unwrap_or_default();
    if ts_part.is_empty() || id_part.is_empty() || parts.next().is_some() {
        return Err(AppError::ValidationError(
            "Invalid comment cursor".to_string(),
        ));
    }
    let created_at = chrono::DateTime::parse_from_rfc3339(ts_part)
        .map_err(|_| AppError::ValidationError("Invalid comment cursor".to_string()))?
        .with_timezone(&chrono::Utc);
    let id = Uuid::parse_str(id_part)
        .map_err(|_| AppError::ValidationError("Invalid comment cursor".to_string()))?;
    Ok(Some(CommentCursor { created_at, id }))
}

fn encode_cursor(created_at: chrono::DateTime<chrono::Utc>, id: Uuid) -> String {
    format!("{}|{}", created_at.to_rfc3339(), id)
}

fn build_comment_page(
    rows: Vec<comment_repo::CommentRow>,
    limit: u32,
) -> (Vec<CommentResponse>, CommentPagination) {
    let mut rows = rows;
    let has_more = rows.len() > limit as usize;
    if has_more {
        rows.truncate(limit as usize);
    }
    let next_cursor = rows.last().map(|row| encode_cursor(row.created_at, row.id));
    let data = rows.into_iter().map(map_comment_response).collect();
    (
        data,
        CommentPagination {
            next_cursor,
            has_more,
        },
    )
}

fn validate_position(
    element_id: Option<Uuid>,
    position_x: Option<f64>,
    position_y: Option<f64>,
) -> Result<(Option<f64>, Option<f64>), AppError> {
    if element_id.is_none() {
        if position_x.is_none() || position_y.is_none() {
            return Err(AppError::ValidationError(
                "Board comments require position_x and position_y".to_string(),
            ));
        }
    }

    if position_x.is_some() ^ position_y.is_some() {
        return Err(AppError::ValidationError(
            "Both position_x and position_y are required together".to_string(),
        ));
    }

    if let Some(value) = position_x {
        if !value.is_finite() {
            return Err(AppError::ValidationError(
                "position_x must be a finite number".to_string(),
            ));
        }
    }
    if let Some(value) = position_y {
        if !value.is_finite() {
            return Err(AppError::ValidationError(
                "position_y must be a finite number".to_string(),
            ));
        }
    }

    Ok((position_x, position_y))
}

fn map_comment_response(row: comment_repo::CommentRow) -> CommentResponse {
    CommentResponse {
        id: row.id,
        board_id: row.board_id,
        element_id: row.element_id,
        parent_id: row.parent_id,
        created_by: row.created_by,
        author: CommentUserResponse {
            id: row.created_by,
            username: row.author_username.unwrap_or_default(),
            display_name: row.author_display_name,
            avatar_url: row.author_avatar_url,
        },
        position_x: row.position_x,
        position_y: row.position_y,
        content: row.content,
        content_html: row.content_html,
        mentions: row.mentions,
        status: row.status,
        resolved_by: row.resolved_by,
        resolved_at: row.resolved_at,
        is_edited: row.is_edited,
        edited_at: row.edited_at,
        reply_count: row.reply_count,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_validation_error<T: std::fmt::Debug>(result: Result<T, AppError>, expected: &str) {
        match result {
            Err(AppError::ValidationError(message)) => {
                assert!(
                    message.contains(expected),
                    "expected validation error containing '{expected}', got '{message}'"
                );
            }
            Err(other) => panic!("expected validation error, got {other:?}"),
            Ok(value) => panic!("expected error, got {value:?}"),
        }
    }

    #[test]
    fn rejects_empty_content() {
        let result = normalize_comment_content("   ");
        assert_validation_error(result, "Comment content is required");
    }

    #[test]
    fn rejects_long_content() {
        let content = "a".repeat(MAX_COMMENT_LENGTH + 1);
        let result = normalize_comment_content(&content);
        assert_validation_error(result, "Comment content exceeds");
    }

    #[test]
    fn trims_content() {
        let result = normalize_comment_content("  Hello ").expect("valid");
        assert_eq!(result, "Hello");
    }

    #[test]
    fn rejects_mentions_over_limit() {
        let mentions = (0..(MAX_COMMENT_MENTIONS + 1))
            .map(|_| Uuid::new_v4())
            .collect::<Vec<_>>();
        let result = normalize_mentions(Some(mentions));
        match result {
            Err(AppError::ValidationError(message)) => {
                assert!(message.contains("mentions limit"));
            }
            Err(other) => panic!("expected validation error, got {other:?}"),
            Ok(value) => panic!("expected error, got {value:?}"),
        }
    }

    #[test]
    fn requires_position_for_board_comment() {
        let result = validate_position(None, None, None);
        assert_validation_error(result, "position_x");
    }

    #[test]
    fn accepts_position_for_element_comment() {
        let result = validate_position(Some(Uuid::new_v4()), None, None);
        assert!(result.is_ok());
    }

    #[test]
    fn rejects_invalid_cursor_format() {
        let result = parse_cursor(Some("invalid"));
        assert!(matches!(result, Err(AppError::ValidationError(_))));
    }

    #[test]
    fn accepts_valid_cursor() {
        let id = Uuid::new_v4();
        let cursor = encode_cursor(chrono::Utc::now(), id);
        let parsed = parse_cursor(Some(&cursor)).expect("valid");
        assert!(parsed.is_some());
        let parsed = parsed.unwrap();
        assert_eq!(parsed.id, id);
    }

    #[test]
    fn rejects_limit_zero() {
        let result = normalize_comment_limit(Some(0));
        assert!(matches!(result, Err(AppError::ValidationError(_))));
    }

    #[test]
    fn rejects_limit_over_max() {
        let result = normalize_comment_limit(Some(MAX_COMMENT_PAGE_SIZE + 1));
        assert!(matches!(result, Err(AppError::ValidationError(_))));
    }
}
