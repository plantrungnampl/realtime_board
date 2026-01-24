use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;
use chrono::{DateTime, Utc};

use crate::{
    error::AppError,
    models::elements::{BoardElement, ElementType},
};

pub struct CreateElementParams {
    pub id: Option<Uuid>,
    pub board_id: Uuid,
    pub layer_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub created_by: Uuid,
    pub element_type: ElementType,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub z_index: i32,
    pub style: serde_json::Value,
    pub properties: serde_json::Value,
    pub metadata: serde_json::Value,
}

pub struct UpdateElementParams {
    pub position_x: Option<f64>,
    pub position_y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub rotation: Option<f64>,
    pub style: Option<serde_json::Value>,
    pub properties: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
}

pub struct ProjectedElementParams {
    pub id: Uuid,
    pub board_id: Uuid,
    pub layer_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub created_by: Uuid,
    pub element_type: ElementType,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub z_index: i32,
    pub style: serde_json::Value,
    pub properties: serde_json::Value,
    pub metadata: serde_json::Value,
    pub version: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ElementProjectionDefaults {
    pub id: Uuid,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub version: i32,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ElementVersionRow {
    pub id: Uuid,
    pub version: i32,
}

pub async fn find_element_by_id(
    pool: &PgPool,
    board_id: Uuid,
    element_id: Uuid,
) -> Result<Option<BoardElement>, AppError> {
    let element = crate::log_query_fetch_optional!(
        "elements.find_by_id",
        sqlx::query_as::<_, BoardElement>(
            r#"
                SELECT *
                FROM board.element
                WHERE id = $1
                  AND board_id = $2
                  AND deleted_at IS NULL
            "#,
        )
        .bind(element_id)
        .bind(board_id)
        .fetch_optional(pool)
    )?;

    Ok(element)
}

pub async fn find_element_by_id_including_deleted(
    pool: &PgPool,
    board_id: Uuid,
    element_id: Uuid,
) -> Result<Option<BoardElement>, AppError> {
    let element = crate::log_query_fetch_optional!(
        "elements.find_by_id_including_deleted",
        sqlx::query_as::<_, BoardElement>(
            r#"
                SELECT *
                FROM board.element
                WHERE id = $1
                  AND board_id = $2
            "#,
        )
        .bind(element_id)
        .bind(board_id)
        .fetch_optional(pool)
    )?;

    Ok(element)
}

pub async fn soft_delete_element(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    element_id: Uuid,
    expected_version: i32,
) -> Result<Option<BoardElement>, AppError> {
    let element = crate::log_query_fetch_optional!(
        "elements.soft_delete",
        sqlx::query_as::<_, BoardElement>(
            r#"
                UPDATE board.element
                SET
                    deleted_at = NOW(),
                    version = version + 1,
                    updated_at = NOW()
                WHERE id = $1
                  AND board_id = $2
                  AND version = $3
                  AND deleted_at IS NULL
                RETURNING *
            "#,
        )
        .bind(element_id)
        .bind(board_id)
        .bind(expected_version)
        .fetch_optional(&mut **tx)
    )?;

    Ok(element)
}

pub async fn restore_element(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    element_id: Uuid,
    expected_version: i32,
) -> Result<Option<BoardElement>, AppError> {
    let element = crate::log_query_fetch_optional!(
        "elements.restore",
        sqlx::query_as::<_, BoardElement>(
            r#"
                UPDATE board.element
                SET
                    deleted_at = NULL,
                    version = version + 1,
                    updated_at = NOW()
                WHERE id = $1
                  AND board_id = $2
                  AND version = $3
                  AND deleted_at IS NOT NULL
                RETURNING *
            "#,
        )
        .bind(element_id)
        .bind(board_id)
        .bind(expected_version)
        .fetch_optional(&mut **tx)
    )?;

    Ok(element)
}

pub async fn max_z_index(
    pool: &PgPool,
    board_id: Uuid,
    layer_id: Option<Uuid>,
) -> Result<i32, AppError> {
    let max = crate::log_query_fetch_one!(
        "elements.max_z_index",
        sqlx::query_scalar::<_, Option<i32>>(
            r#"
                SELECT MAX(z_index)
                FROM board.element
                WHERE board_id = $1
                AND layer_id IS NOT DISTINCT FROM $2
                AND deleted_at IS NULL
            "#,
        )
        .bind(board_id)
        .bind(layer_id)
        .fetch_one(pool)
    )?;

    Ok(max.unwrap_or(0))
}

pub async fn create_element(
    tx: &mut Transaction<'_, Postgres>,
    params: CreateElementParams,
) -> Result<BoardElement, AppError> {
    let style = sqlx::types::Json(params.style);
    let properties = sqlx::types::Json(params.properties);
    let metadata = sqlx::types::Json(params.metadata);

    let element = crate::log_query_fetch_one!(
        "elements.create_element",
        sqlx::query_as::<_, BoardElement>(
            r#"
                INSERT INTO board.element (
                    id,
                    board_id,
                    layer_id,
                    parent_id,
                    created_by,
                    element_type,
                    position_x,
                    position_y,
                    width,
                    height,
                    rotation,
                    z_index,
                    style,
                    properties,
                    metadata
                )
                VALUES (
                    COALESCE($1, uuid_generate_v7()), $2, $3, $4, $5,
                    $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15
                )
                RETURNING *
            "#,
        )
        .bind(params.id)
        .bind(params.board_id)
        .bind(params.layer_id)
        .bind(params.parent_id)
        .bind(params.created_by)
        .bind(params.element_type)
        .bind(params.position_x)
        .bind(params.position_y)
        .bind(params.width)
        .bind(params.height)
        .bind(params.rotation)
        .bind(params.z_index)
        .bind(style)
        .bind(properties)
        .bind(metadata)
        .fetch_one(&mut **tx)
    )?;

    Ok(element)
}

pub async fn set_actor_id(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
) -> Result<(), AppError> {
    crate::log_query_execute!(
        "elements.set_actor_id",
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(user_id.to_string())
            .execute(&mut **tx)
    )?;

    Ok(())
}

pub async fn update_element(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    element_id: Uuid,
    expected_version: i32,
    params: UpdateElementParams,
) -> Result<Option<BoardElement>, AppError> {
    let style = params.style.map(sqlx::types::Json);
    let properties = params.properties.map(sqlx::types::Json);
    let metadata = params.metadata.map(sqlx::types::Json);

    let element = crate::log_query_fetch_optional!(
        "elements.update_element",
        sqlx::query_as::<_, BoardElement>(
            r#"
                UPDATE board.element
                SET
                    position_x = COALESCE($4, position_x),
                    position_y = COALESCE($5, position_y),
                    width = COALESCE($6, width),
                    height = COALESCE($7, height),
                    rotation = COALESCE($8, rotation),
                    style = style || COALESCE($9, '{}'::jsonb),
                    properties = properties || COALESCE($10, '{}'::jsonb),
                    metadata = metadata || COALESCE($11, '{}'::jsonb),
                    version = version + 1,
                    updated_at = NOW()
                WHERE id = $1
                  AND board_id = $2
                  AND version = $3
                  AND deleted_at IS NULL
                RETURNING *
            "#,
        )
        .bind(element_id)
        .bind(board_id)
        .bind(expected_version)
        .bind(params.position_x)
        .bind(params.position_y)
        .bind(params.width)
        .bind(params.height)
        .bind(params.rotation)
        .bind(style)
        .bind(properties)
        .bind(metadata)
        .fetch_optional(&mut **tx)
    )?;

    Ok(element)
}

pub async fn upsert_projected_element(
    tx: &mut Transaction<'_, Postgres>,
    params: ProjectedElementParams,
) -> Result<(), AppError> {
    let style = sqlx::types::Json(params.style);
    let properties = sqlx::types::Json(params.properties);
    let metadata = sqlx::types::Json(params.metadata);

    crate::log_query_execute!(
        "elements.upsert_projected_element",
        sqlx::query(
            r#"
                INSERT INTO board.element (
                    id,
                    board_id,
                    layer_id,
                    parent_id,
                    created_by,
                    element_type,
                    position_x,
                    position_y,
                    width,
                    height,
                    rotation,
                    z_index,
                    style,
                    properties,
                    metadata,
                    version,
                    created_at,
                    updated_at,
                    deleted_at
                )
                VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15,
                    $16, $17, $18, $19
                )
                ON CONFLICT (id) DO UPDATE
                SET
                    board_id = EXCLUDED.board_id,
                    layer_id = EXCLUDED.layer_id,
                    parent_id = EXCLUDED.parent_id,
                    created_by = EXCLUDED.created_by,
                    element_type = EXCLUDED.element_type,
                    position_x = EXCLUDED.position_x,
                    position_y = EXCLUDED.position_y,
                    width = EXCLUDED.width,
                    height = EXCLUDED.height,
                    rotation = EXCLUDED.rotation,
                    z_index = EXCLUDED.z_index,
                    style = EXCLUDED.style,
                    properties = EXCLUDED.properties,
                    metadata = EXCLUDED.metadata,
                    version = EXCLUDED.version,
                    created_at = EXCLUDED.created_at,
                    updated_at = EXCLUDED.updated_at,
                    deleted_at = EXCLUDED.deleted_at
                WHERE board.element.version IS DISTINCT FROM EXCLUDED.version
                   OR board.element.deleted_at IS DISTINCT FROM EXCLUDED.deleted_at
                   OR board.element.updated_at IS DISTINCT FROM EXCLUDED.updated_at
            "#,
        )
        .bind(params.id)
        .bind(params.board_id)
        .bind(params.layer_id)
        .bind(params.parent_id)
        .bind(params.created_by)
        .bind(params.element_type)
        .bind(params.position_x)
        .bind(params.position_y)
        .bind(params.width)
        .bind(params.height)
        .bind(params.rotation)
        .bind(params.z_index)
        .bind(style)
        .bind(properties)
        .bind(metadata)
        .bind(params.version)
        .bind(params.created_at)
        .bind(params.updated_at)
        .bind(params.deleted_at)
        .execute(&mut **tx)
    )?;

    Ok(())
}

pub async fn list_element_versions(
    pool: &PgPool,
    board_id: Uuid,
) -> Result<Vec<ElementVersionRow>, AppError> {
    let elements = crate::log_query_fetch_all!(
        "elements.list_element_versions",
        sqlx::query_as::<_, ElementVersionRow>(
            r#"
                SELECT id, version
                FROM board.element
                WHERE board_id = $1
                  AND deleted_at IS NULL
            "#,
        )
        .bind(board_id)
        .fetch_all(pool)
    )?;

    Ok(elements)
}

pub async fn list_elements_by_board(
    pool: &PgPool,
    board_id: Uuid,
) -> Result<Vec<BoardElement>, AppError> {
    let elements = crate::log_query_fetch_all!(
        "elements.list_elements_by_board",
        sqlx::query_as::<_, BoardElement>(
            r#"
                SELECT *
                FROM board.element
                WHERE board_id = $1
                  AND deleted_at IS NULL
                ORDER BY z_index ASC, created_at ASC
            "#,
        )
        .bind(board_id)
        .fetch_all(pool)
    )?;

    Ok(elements)
}

pub async fn list_elements_by_board_including_deleted(
    pool: &PgPool,
    board_id: Uuid,
) -> Result<Vec<BoardElement>, AppError> {
    let elements = crate::log_query_fetch_all!(
        "elements.list_elements_by_board_including_deleted",
        sqlx::query_as::<_, BoardElement>(
            r#"
                SELECT *
                FROM board.element
                WHERE board_id = $1
                ORDER BY z_index ASC, created_at ASC
            "#,
        )
        .bind(board_id)
        .fetch_all(pool)
    )?;

    Ok(elements)
}

pub async fn list_projection_defaults(
    pool: &PgPool,
    board_id: Uuid,
) -> Result<Vec<ElementProjectionDefaults>, AppError> {
    let rows = crate::log_query_fetch_all!(
        "elements.list_projection_defaults",
        sqlx::query_as::<_, ElementProjectionDefaults>(
            r#"
                SELECT id, created_by, created_at, updated_at, version
                FROM board.element
                WHERE board_id = $1
            "#,
        )
        .bind(board_id)
        .fetch_all(pool)
    )?;

    Ok(rows)
}
