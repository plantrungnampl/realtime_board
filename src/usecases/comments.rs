use std::collections::HashSet;

use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    dto::comments::{
        CommentListResponse, CommentResponse, CommentUserResponse, CreateCommentRequest,
        ListCommentsQuery,
    },
    error::AppError,
    repositories::{
        comments as comment_repo, comments::CreateCommentParams, elements as element_repo,
    },
    usecases::boards::BoardService,
};

pub struct CommentService;

const MIN_COMMENT_LENGTH: usize = 1;
const MAX_COMMENT_LENGTH: usize = 5000;
const MAX_COMMENT_MENTIONS: usize = 20;

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
        tx.commit().await?;

        Ok(map_comment_response(row))
    }

    pub async fn list_comments(
        pool: &PgPool,
        board_id: Uuid,
        user_id: Uuid,
        query: ListCommentsQuery,
    ) -> Result<CommentListResponse, AppError> {
        BoardService::ensure_can_view(pool, board_id, user_id).await?;

        let rows = comment_repo::list_comments(
            pool,
            board_id,
            query.element_id,
            query.parent_id,
            query.status,
        )
        .await?;
        let data = rows.into_iter().map(map_comment_response).collect();

        Ok(CommentListResponse { data })
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

    fn assert_validation_error(result: Result<String, AppError>, expected: &str) {
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
}
