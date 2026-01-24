use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    dto::boards::BoardResponse,
    error::AppError,
    models::{
        boards::{Board, BoardPermissionOverrides, BoardRole, CanvasSettings},
        organizations::OrgRole,
    },
};

#[derive(Debug)]
pub(crate) struct CreateBoardParams {
    pub organization_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub is_public: bool,
    pub is_template: bool,
    pub canvas_settings: CanvasSettings,
}

#[derive(Debug, sqlx::FromRow)]
struct BoardResponseRow {
    pub id: Uuid,
    pub created_by: Uuid,
    pub organization_id: Option<Uuid>,
    pub name: String,
    pub username: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub is_favorite: bool,
    pub last_accessed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct BoardMemberRow {
    pub member_id: Uuid,
    pub user_id: Uuid,
    pub username: Option<String>,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub role: BoardRole,
    #[sqlx(json)]
    pub custom_permissions: Option<BoardPermissionOverrides>,
    pub org_role: Option<OrgRole>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct BoardMemberRecord {
    pub user_id: Uuid,
    pub role: BoardRole,
    #[sqlx(json)]
    pub custom_permissions: Option<BoardPermissionOverrides>,
}

pub async fn list_boards_for_user(
    pool: &PgPool,
    user_id: Uuid,
    organization_id: Option<Uuid>,
    is_template: Option<bool>,
) -> Result<Vec<BoardResponse>, AppError> {
    let rows = sqlx::query_as::<_, BoardResponseRow>(
        r#"
            SELECT
                b.id,
                b.created_by,
                b.organization_id,
                b.name,
                b.description,
                b.thumbnail_url,
                b.created_at,
                b.updated_at,
                COALESCE(bm.is_favorite, false) AS is_favorite,
                bm.last_accessed_at,
                COALESCE(owner.username, creator_in_scope.username, '') AS username
            FROM board.board b
            JOIN core.user creator ON b.created_by = creator.id
            LEFT JOIN LATERAL (
                SELECT creator.username
                WHERE b.organization_id IS NULL
                OR EXISTS (
                    SELECT 1
                    FROM core.organization_member om_creator
                    WHERE om_creator.organization_id = b.organization_id
                    AND om_creator.user_id = creator.id
                )
            ) creator_in_scope ON TRUE
            LEFT JOIN LATERAL (
                SELECT u.username
                FROM board.board_member bm_owner
                JOIN core.user u ON u.id = bm_owner.user_id
                LEFT JOIN core.organization_member om_owner
                    ON om_owner.organization_id = b.organization_id
                    AND om_owner.user_id = bm_owner.user_id
                    AND om_owner.accepted_at IS NOT NULL
                WHERE bm_owner.board_id = b.id
                AND bm_owner.role = 'owner'
                AND u.deleted_at IS NULL
                AND (b.organization_id IS NULL OR om_owner.user_id IS NOT NULL)
                ORDER BY bm_owner.created_at ASC
                LIMIT 1
            ) owner ON TRUE
            LEFT JOIN board.board_member bm
                ON bm.board_id = b.id
                AND bm.user_id = $1
            LEFT JOIN core.organization_member om
                ON om.organization_id = b.organization_id
                AND om.user_id = $1
                AND om.accepted_at IS NOT NULL
            WHERE b.deleted_at IS NULL
            AND b.archived_at IS NULL
            AND ($2 IS NULL OR b.organization_id = $2)
            AND ($3 IS NULL OR b.is_template = $3)
            AND (
                (bm.user_id IS NOT NULL AND (b.organization_id IS NULL OR om.user_id IS NOT NULL))
                OR om.role IN ('owner', 'admin')
            )
            ORDER BY b.updated_at DESC
        "#,
    )
    .bind(user_id)
    .bind(organization_id)
    .bind(is_template)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| BoardResponse {
            id: row.id,
            created_by: row.created_by,
            organization_id: row.organization_id,
            name: row.name,
            username: row.username,
            description: row.description,
            thumbnail_url: row.thumbnail_url,
            is_favorite: row.is_favorite,
            last_accessed_at: row.last_accessed_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
        .collect())
}

pub async fn find_board_by_id(
    pool: &PgPool,
    board_id: Uuid,
) -> Result<Option<Board>, AppError> {
    let board = sqlx::query_as::<_, Board>(
        r#"
            SELECT *
            FROM board.board
            WHERE id = $1
            AND deleted_at IS NULL
            AND archived_at IS NULL
        "#,
    )
    .bind(board_id)
    .fetch_optional(pool)
    .await?;

    Ok(board)
}

pub async fn find_board_by_id_including_deleted(
    pool: &PgPool,
    board_id: Uuid,
) -> Result<Option<Board>, AppError> {
    let board = sqlx::query_as::<_, Board>(
        r#"
            SELECT *
            FROM board.board
            WHERE id = $1
        "#,
    )
    .bind(board_id)
    .fetch_optional(pool)
    .await?;

    Ok(board)
}

pub async fn create_board(
    tx: &mut Transaction<'_, Postgres>,
    params: CreateBoardParams,
    user_id: Uuid,
) -> Result<Board, AppError> {
    let board = sqlx::query_as(
        r#"
            INSERT INTO board.board (
                created_by,
                organization_id,
                name,
                description,
                thumbnail_url,
                is_public,
                is_template,
                canvas_settings
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        "#,
    )
    .bind(user_id)
    .bind(params.organization_id)
    .bind(params.name)
    .bind(params.description)
    .bind(params.thumbnail_url)
    .bind(params.is_public)
    .bind(params.is_template)
    .bind(sqlx::types::Json(params.canvas_settings))
    .fetch_one(&mut **tx)
    .await?;

    Ok(board)
}

pub async fn add_owner_member(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            INSERT INTO board.board_member (board_id, user_id, role)
            VALUES ($1, $2, 'owner')
            ON CONFLICT (board_id, user_id) DO NOTHING
        "#,
    )
    .bind(board_id)
    .bind(user_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Ensures the user is an owner for the board (upsert).
pub async fn ensure_board_owner(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            INSERT INTO board.board_member (board_id, user_id, role)
            VALUES ($1, $2, 'owner')
            ON CONFLICT (board_id, user_id)
            DO UPDATE SET role = 'owner', updated_at = NOW()
        "#,
    )
    .bind(board_id)
    .bind(user_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn set_actor_id(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
        .bind(user_id.to_string())
        .execute(&mut **tx)
        .await?;

    Ok(())
}

pub async fn get_board_member_access(
    pool: &PgPool,
    board_id: Uuid,
    user_id: Uuid,
) -> Result<Option<BoardMemberRecord>, AppError> {
    let member = sqlx::query_as::<_, BoardMemberRecord>(
        r#"
            SELECT user_id, role, COALESCE(custom_permissions, '{}'::jsonb) AS custom_permissions
            FROM board.board_member
            WHERE board_id = $1
            AND user_id = $2
        "#,
    )
    .bind(board_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(member)
}

/// Loads the organization id for a board, returning `Ok(None)` for personal boards.
pub async fn load_board_organization_id(
    pool: &PgPool,
    board_id: Uuid,
) -> Result<Option<Uuid>, AppError> {
    let organization_id = sqlx::query_scalar::<_, Option<Uuid>>(
        r#"
            SELECT organization_id
            FROM board.board
            WHERE id = $1
            AND deleted_at IS NULL
            AND archived_at IS NULL
        "#,
    )
    .bind(board_id)
    .fetch_optional(pool)
    .await?;

    match organization_id {
        Some(value) => Ok(value),
        None => Err(AppError::NotFound("Board not found".to_string())),
    }
}

pub async fn list_board_members(
    pool: &PgPool,
    board_id: Uuid,
) -> Result<Vec<BoardMemberRow>, AppError> {
    let rows = sqlx::query_as::<_, BoardMemberRow>(
        r#"
            SELECT
                bm.id AS member_id,
                u.id AS user_id,
                u.username,
                u.display_name,
                u.avatar_url,
                bm.role,
                COALESCE(bm.custom_permissions, '{}'::jsonb) AS custom_permissions,
                om.role AS org_role,
                bm.created_at,
                bm.updated_at
            FROM board.board_member bm
            JOIN board.board b ON b.id = bm.board_id
            JOIN core.user u ON u.id = bm.user_id
            LEFT JOIN core.organization_member om
                ON om.organization_id = b.organization_id
                AND om.user_id = bm.user_id
                AND om.accepted_at IS NOT NULL
            WHERE bm.board_id = $1
            AND u.deleted_at IS NULL
            ORDER BY bm.created_at ASC
        "#,
    )
    .bind(board_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_board_member_by_id(
    pool: &PgPool,
    board_id: Uuid,
    member_id: Uuid,
) -> Result<Option<BoardMemberRecord>, AppError> {
    let member = sqlx::query_as::<_, BoardMemberRecord>(
        r#"
            SELECT user_id, role, COALESCE(custom_permissions, '{}'::jsonb) AS custom_permissions
            FROM board.board_member
            WHERE board_id = $1
            AND id = $2
        "#,
    )
    .bind(board_id)
    .bind(member_id)
    .fetch_optional(pool)
    .await?;

    Ok(member)
}

pub async fn get_board_member_by_user_id(
    pool: &PgPool,
    board_id: Uuid,
    user_id: Uuid,
) -> Result<Option<BoardMemberRecord>, AppError> {
    let member = sqlx::query_as::<_, BoardMemberRecord>(
        r#"
            SELECT user_id, role, COALESCE(custom_permissions, '{}'::jsonb) AS custom_permissions
            FROM board.board_member
            WHERE board_id = $1
            AND user_id = $2
        "#,
    )
    .bind(board_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(member)
}

pub async fn touch_board_last_accessed(
    pool: &PgPool,
    board_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            UPDATE board.board_member
            SET last_accessed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE board_id = $1
            AND user_id = $2
            -- Perf: avoid extra writes when users reopen a board rapidly.
            AND (
                last_accessed_at IS NULL
                OR last_accessed_at < (CURRENT_TIMESTAMP - INTERVAL '1 minute')
            )
        "#,
    )
    .bind(board_id)
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn toggle_board_favorite(
    pool: &PgPool,
    board_id: Uuid,
    user_id: Uuid,
) -> Result<Option<bool>, AppError> {
    let is_favorite = sqlx::query_scalar::<_, bool>(
        r#"
            UPDATE board.board_member
            SET is_favorite = NOT COALESCE(is_favorite, false),
                updated_at = CURRENT_TIMESTAMP
            WHERE board_id = $1
            AND user_id = $2
            RETURNING is_favorite
        "#,
    )
    .bind(board_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(is_favorite)
}

pub async fn update_board_metadata(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    name: Option<String>,
    description: Option<String>,
    is_public: Option<bool>,
) -> Result<Board, AppError> {
    let board = sqlx::query_as::<_, Board>(
        r#"
            UPDATE board.board
            SET
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                is_public = COALESCE($4, is_public),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            AND deleted_at IS NULL
            RETURNING *
        "#,
    )
    .bind(board_id)
    .bind(name)
    .bind(description)
    .bind(is_public)
    .fetch_one(&mut **tx)
    .await?;

    Ok(board)
}

pub async fn mark_board_deleted(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            UPDATE board.board
            SET deleted_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            AND deleted_at IS NULL
        "#,
    )
    .bind(board_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn restore_board(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            UPDATE board.board
            SET deleted_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            AND deleted_at IS NOT NULL
        "#,
    )
    .bind(board_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn purge_deleted_boards(
    tx: &mut Transaction<'_, Postgres>,
    retention_days: i64,
) -> Result<u64, AppError> {
    let result = sqlx::query(
        r#"
            DELETE FROM board.board
            WHERE deleted_at IS NOT NULL
            AND deleted_at <= (CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day'))
        "#,
    )
    .bind(retention_days)
    .execute(&mut **tx)
    .await?;

    Ok(result.rows_affected())
}

pub async fn set_board_archived(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    archived_at: Option<DateTime<Utc>>,
) -> Result<Board, AppError> {
    let board = sqlx::query_as::<_, Board>(
        r#"
            UPDATE board.board
            SET archived_at = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            AND deleted_at IS NULL
            RETURNING *
        "#,
    )
    .bind(board_id)
    .bind(archived_at)
    .fetch_one(&mut **tx)
    .await?;

    Ok(board)
}

pub async fn demote_other_board_owners(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    keep_owner_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            UPDATE board.board_member
            SET role = 'admin'
            WHERE board_id = $1
            AND role = 'owner'
            AND user_id <> $2
        "#,
    )
    .bind(board_id)
    .bind(keep_owner_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn add_board_member(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    user_id: Uuid,
    role: BoardRole,
    invited_by: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            INSERT INTO board.board_member (
                board_id,
                user_id,
                role,
                invited_by
            )
            VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(board_id)
    .bind(user_id)
    .bind(role)
    .bind(invited_by)
    .execute(&mut **tx)
    .await
    .map_err(map_board_member_unique_violation)?;

    Ok(())
}

pub async fn update_board_member_role(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    member_id: Uuid,
    role: BoardRole,
    custom_permissions: Option<BoardPermissionOverrides>,
) -> Result<(), AppError> {
    let custom_permissions = custom_permissions.map(sqlx::types::Json);
    sqlx::query(
        r#"
            UPDATE board.board_member
            SET role = $3,
                custom_permissions = COALESCE($4, custom_permissions),
                updated_at = NOW()
            WHERE board_id = $1
            AND id = $2
        "#,
    )
    .bind(board_id)
    .bind(member_id)
    .bind(role)
    .bind(custom_permissions)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn remove_board_member(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    member_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            DELETE FROM board.board_member
            WHERE board_id = $1
            AND id = $2
        "#,
    )
    .bind(board_id)
    .bind(member_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Lists boards in an organization where the user is the only owner.
pub async fn list_boards_requiring_owner_transfer(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<Vec<Uuid>, AppError> {
    let rows = sqlx::query_scalar::<_, Uuid>(
        r#"
            SELECT bm.board_id
            FROM board.board_member bm
            JOIN board.board b ON b.id = bm.board_id
            WHERE b.organization_id = $1
            AND b.deleted_at IS NULL
            AND bm.user_id = $2
            AND bm.role = 'owner'
            AND NOT EXISTS (
                SELECT 1
                FROM board.board_member bm_other
                WHERE bm_other.board_id = bm.board_id
                AND bm_other.role = 'owner'
                AND bm_other.user_id <> $2
            )
        "#,
    )
    .bind(organization_id)
    .bind(user_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(rows)
}

/// Removes all board memberships for a user within an organization.
pub async fn remove_board_memberships_by_organization(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            DELETE FROM board.board_member bm
            USING board.board b
            WHERE bm.board_id = b.id
            AND b.organization_id = $1
            AND bm.user_id = $2
        "#,
    )
    .bind(organization_id)
    .bind(user_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn count_board_owners(pool: &PgPool, board_id: Uuid) -> Result<i64, AppError> {
    let count = sqlx::query_scalar::<_, i64>(
        r#"
            SELECT COUNT(*)
            FROM board.board_member
            WHERE board_id = $1
            AND role = 'owner'
        "#,
    )
    .bind(board_id)
    .fetch_one(pool)
    .await?;

    Ok(count)
}

/// Counts active boards for an organization.
pub async fn count_boards_by_organization(
    pool: &PgPool,
    organization_id: Uuid,
) -> Result<i64, AppError> {
    let count = sqlx::query_scalar::<_, i64>(
        r#"
            SELECT COUNT(*)
            FROM board.board
            WHERE organization_id = $1
            AND deleted_at IS NULL
            AND archived_at IS NULL
        "#,
    )
    .bind(organization_id)
    .fetch_one(pool)
    .await?;

    Ok(count)
}

/// Counts active personal boards owned by a user.
pub async fn count_personal_boards_by_owner(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<i64, AppError> {
    let count = sqlx::query_scalar::<_, i64>(
        r#"
            SELECT COUNT(*)
            FROM board.board b
            JOIN board.board_member bm
                ON bm.board_id = b.id
                AND bm.role = 'owner'
            WHERE b.organization_id IS NULL
            AND b.deleted_at IS NULL
            AND b.archived_at IS NULL
            AND bm.user_id = $1
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(count)
}

fn map_board_member_unique_violation(err: sqlx::Error) -> AppError {
    match &err {
        sqlx::Error::Database(db_err) => {
            if db_err.code().as_deref() == Some("23505") {
                return AppError::Conflict("Board member already exists".to_string());
            }
            AppError::Database(err)
        }
        _ => err.into(),
    }
}
