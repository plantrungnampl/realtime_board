use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    dto::boards::{BoardResponse, CreateBoardRequest},
    error::AppError,
    models::boards::{Board, BoardRole},
};

#[derive(Debug, sqlx::FromRow)]
struct BoardResponseRow {
    pub id: Uuid,
    pub created_by: Uuid,
    pub organization_id: Option<Uuid>,
    pub name: String,
    pub username: String,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
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
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct BoardMemberRecord {
    pub role: BoardRole,
}

pub async fn list_boards_for_user(
    pool: &PgPool,
    user_id: Uuid,
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
                u.username
            FROM board.board b
            JOIN core.user u ON b.created_by = u.id
            JOIN board.board_member bm
                ON bm.board_id = b.id
                AND bm.user_id = $1
            WHERE b.deleted_at IS NULL
            ORDER BY b.updated_at DESC
        "#,
    )
    .bind(user_id)
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
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
        .collect())
}

pub async fn create_board(
    tx: &mut Transaction<'_, Postgres>,
    req: CreateBoardRequest,
    user_id: Uuid,
) -> Result<Board, AppError> {
    let board = sqlx::query_as(
        r#"
            INSERT INTO board.board (created_by, organization_id, name, description)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        "#,
    )
    .bind(user_id)
    .bind(req.organization_id)
    .bind(req.name)
    .bind(req.description)
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

pub async fn get_board_member_role(
    pool: &PgPool,
    board_id: Uuid,
    user_id: Uuid,
) -> Result<Option<BoardRole>, AppError> {
    let role = sqlx::query_scalar::<_, BoardRole>(
        r#"
            SELECT role
            FROM board.board_member
            WHERE board_id = $1
            AND user_id = $2
        "#,
    )
    .bind(board_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(role)
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
                bm.created_at,
                bm.updated_at
            FROM board.board_member bm
            JOIN core.user u ON u.id = bm.user_id
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
            SELECT role
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
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            UPDATE board.board_member
            SET role = $3, updated_at = NOW()
            WHERE board_id = $1
            AND id = $2
        "#,
    )
    .bind(board_id)
    .bind(member_id)
    .bind(role)
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
        "#,
    )
    .bind(organization_id)
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
