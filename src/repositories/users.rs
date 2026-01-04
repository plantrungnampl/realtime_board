use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    error::AppError,
    models::users::{User, UserPreferences},
};

pub async fn email_exists(pool: &PgPool, email: &str) -> Result<bool, AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(SELECT 1 FROM core.user WHERE email = $1 AND deleted_at IS NULL)
    "#,
    )
    .bind(email)
    .fetch_one(pool)
    .await?;

    Ok(exists)
}

pub async fn username_exists(pool: &PgPool, username: &str) -> Result<bool, AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM core.user
            WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL
        )
    "#,
    )
    .bind(username)
    .fetch_one(pool)
    .await?;

    Ok(exists)
}

pub async fn insert_user(
    pool: &PgPool,
    email: &str,
    password_hash: &str,
    display_name: &str,
    username: &str,
) -> Result<User, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"
            INSERT INTO core.user(email, password_hash, display_name, username)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        "#,
    )
    .bind(email)
    .bind(password_hash)
    .bind(display_name)
    .bind(username)
    .fetch_one(pool)
    .await?;

    Ok(user)
}

pub async fn insert_user_tx(
    tx: &mut Transaction<'_, Postgres>,
    email: &str,
    password_hash: &str,
    display_name: &str,
    username: &str,
) -> Result<User, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"
            INSERT INTO core.user(email, password_hash, display_name, username)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        "#,
    )
    .bind(email)
    .bind(password_hash)
    .bind(display_name)
    .bind(username)
    .fetch_one(&mut **tx)
    .await?;

    Ok(user)
}

pub async fn find_user_by_email(pool: &PgPool, email: &str) -> Result<Option<User>, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"
            SELECT * FROM core.user WHERE email = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(email)
    .fetch_optional(pool)
    .await?;

    Ok(user)
}

pub async fn update_last_active(pool: &PgPool, user_id: Uuid) -> Result<(), AppError> {
    sqlx::query("UPDATE core.user SET last_active_at = CURRENT_TIMESTAMP WHERE id  = $1")
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn mark_email_verified_tx(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        "UPDATE core.user SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1",
    )
    .bind(user_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn get_user_by_id(pool: &PgPool, user_id: Uuid) -> Result<User, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"
            SELECT * FROM core.user WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(user)
}

pub async fn update_user_profile(
    pool: &PgPool,
    user_id: Uuid,
    display_name: Option<&str>,
    avatar_url: Option<&str>,
    bio: Option<&str>,
) -> Result<User, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"
            UPDATE core.user
            SET
                display_name = COALESCE($2, display_name),
                avatar_url = COALESCE($3, avatar_url),
                bio = COALESCE($4, bio),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING *
        "#,
    )
    .bind(user_id)
    .bind(display_name)
    .bind(avatar_url)
    .bind(bio)
    .fetch_one(pool)
    .await?;

    Ok(user)
}

pub async fn update_user_preferences(
    pool: &PgPool,
    user_id: Uuid,
    preferences: &UserPreferences,
) -> Result<User, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"
            UPDATE core.user
            SET
                preferences = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING *
        "#,
    )
    .bind(user_id)
    .bind(sqlx::types::Json(preferences))
    .fetch_one(pool)
    .await?;

    Ok(user)
}

pub async fn update_password_hash(
    pool: &PgPool,
    user_id: Uuid,
    password_hash: &str,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            UPDATE core.user
            SET password_hash = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(user_id)
    .bind(password_hash)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn mark_user_deleted(pool: &PgPool, user_id: Uuid) -> Result<(), AppError> {
    sqlx::query(
        r#"
            UPDATE core.user
            SET deleted_at = CURRENT_TIMESTAMP,
                is_active = false,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Marks profile setup as completed and updates optional profile fields.
pub async fn complete_profile_setup(
    pool: &PgPool,
    user_id: Uuid,
    display_name: Option<&str>,
    avatar_url: Option<&str>,
    bio: Option<&str>,
) -> Result<User, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"
            UPDATE core.user
            SET
                display_name = COALESCE($2, display_name),
                avatar_url = COALESCE($3, avatar_url),
                bio = COALESCE($4, bio),
                metadata = jsonb_set(
                    COALESCE(metadata, '{}'::jsonb),
                    '{profile_setup_completed}',
                    'true'::jsonb,
                    true
                ),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING *
        "#,
    )
    .bind(user_id)
    .bind(display_name)
    .bind(avatar_url)
    .bind(bio)
    .fetch_one(pool)
    .await?;

    Ok(user)
}

pub async fn verification_sent_at(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<Option<DateTime<Utc>>, AppError> {
    let value = sqlx::query_scalar::<_, Option<String>>(
        r#"
            SELECT metadata->>'verification_sent_at'
            FROM core.user
            WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    let value = match value {
        Some(value) => value,
        None => return Ok(None),
    };

    let parsed = DateTime::parse_from_rfc3339(&value)
        .map(|dt| dt.with_timezone(&Utc))
        .ok();
    Ok(parsed)
}

pub async fn set_verification_sent_at(
    pool: &PgPool,
    user_id: Uuid,
    sent_at: DateTime<Utc>,
) -> Result<(), AppError> {
    let sent_at = sent_at.to_rfc3339();
    sqlx::query(
        r#"
            UPDATE core.user
            SET
                metadata = jsonb_set(
                    COALESCE(metadata, '{}'::jsonb),
                    '{verification_sent_at}',
                    to_jsonb($2::text),
                    true
                ),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(user_id)
    .bind(sent_at)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn mark_email_verified(pool: &PgPool, user_id: Uuid) -> Result<User, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"
            UPDATE core.user
            SET email_verified_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING *
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(user)
}
