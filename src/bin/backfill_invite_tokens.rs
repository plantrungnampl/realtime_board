use std::env;

use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

#[path = "../auth/invite_tokens.rs"]
mod invite_tokens;

#[derive(Debug, sqlx::FromRow)]
struct InviteRow {
    id: Uuid,
    invite_token: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    let database_url = env::var("DATABASE_URL").map_err(|_| {
        std::io::Error::new(std::io::ErrorKind::NotFound, "DATABASE_URL must be set")
    })?;

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    let rows = sqlx::query_as::<_, InviteRow>(
        r#"
        SELECT id, invite_token
        FROM core.organization_invite
        WHERE invite_token IS NOT NULL
        AND invite_token_hash IS NULL
        "#,
    )
    .fetch_all(&pool)
    .await?;

    let scanned = rows.len() as u64;
    let mut updated = 0u64;

    for row in rows {
        let hash = invite_tokens::hash_invite_token(&row.invite_token);
        let result = sqlx::query(
            r#"
            UPDATE core.organization_invite
            SET invite_token_hash = $1,
                invite_token = NULL
            WHERE id = $2
            AND invite_token_hash IS NULL
            "#,
        )
        .bind(hash)
        .bind(row.id)
        .execute(&pool)
        .await?;

        updated += result.rows_affected();
    }

    let skipped = scanned.saturating_sub(updated);

    println!(
        "Backfill invite tokens: scanned={} updated={} skipped={}",
        scanned, updated, skipped
    );

    Ok(())
}
