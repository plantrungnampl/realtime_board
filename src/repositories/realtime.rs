use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

pub async fn insert_update_log(
    pool: &PgPool,
    board_id: Uuid,
    actor_id: Option<Uuid>,
    update_bin: Vec<u8>,
) -> Result<(), AppError> {
    crate::log_query_execute!(
        "realtime.insert_update_log",
        sqlx::query!(
            r#"
                INSERT INTO crdt.board_update (board_id, actor_id, update_bin)
                VALUES ($1, $2, $3)
            "#,
            board_id,
            actor_id,
            update_bin
        )
        .execute(pool)
    )?;
    Ok(())
}

pub async fn latest_snapshot(
    pool: &PgPool,
    board_id: Uuid,
) -> Result<Option<(i64, Vec<u8>)>, AppError> {
    let record = crate::log_query_fetch_optional!(
        "realtime.latest_snapshot",
        sqlx::query!(
            r#"
            SELECT snapshot_seq, state_bin
            FROM crdt.board_snapshot
            WHERE board_id = $1
            ORDER BY snapshot_seq DESC
            LIMIT 1
            "#,
            board_id
        )
        .fetch_optional(pool)
    )?;

    Ok(record.map(|r| (r.snapshot_seq, r.state_bin)))
}

pub async fn updates_after_seq(
    pool: &PgPool,
    board_id: Uuid,
    start_seq: i64,
) -> Result<Vec<(i64, Vec<u8>)>, AppError> {
    let records = crate::log_query_fetch_all!(
        "realtime.updates_after_seq",
        sqlx::query!(
            r#"
            SELECT update_bin, seq
            FROM crdt.board_update
            WHERE board_id = $1 AND seq > $2
            ORDER BY seq ASC
            "#,
            board_id,
            start_seq
        )
        .fetch_all(pool)
    )?;

    Ok(records.into_iter().map(|r| (r.seq, r.update_bin)).collect())
}

pub async fn updates_after_seq_chunked(
    pool: &PgPool,
    board_id: Uuid,
    start_seq: i64,
    limit: i64,
) -> Result<Vec<(i64, Vec<u8>)>, AppError> {
    let records: Vec<_> = crate::log_query_fetch_all!(
        "realtime.updates_after_seq_chunked",
        sqlx::query!(
            r#"
            SELECT update_bin, seq
            FROM crdt.board_update
            WHERE board_id = $1 AND seq > $2
            ORDER BY seq ASC
            LIMIT $3
            "#,
            board_id,
            start_seq,
            limit
        )
        .fetch_all(pool)
    )?;

    Ok(records.into_iter().map(|r| (r.seq, r.update_bin)).collect())
}

pub async fn last_snapshot_seq(pool: &PgPool, board_id: Uuid) -> Result<i64, AppError> {
    Ok(crate::log_query_fetch_one!(
        "realtime.last_snapshot_seq",
        sqlx::query!(
            r#"
            SELECT COALESCE(MAX(snapshot_seq), 0) as "snapshot_seq!"
            FROM crdt.board_snapshot
            WHERE board_id = $1
            "#,
            board_id
        )
        .fetch_one(pool)
    )?
    .snapshot_seq)
}

pub async fn latest_update_seq(pool: &PgPool, board_id: Uuid) -> Result<i64, AppError> {
    Ok(crate::log_query_fetch_one!(
        "realtime.latest_update_seq",
        sqlx::query!(
            r#"
            SELECT COALESCE(MAX(seq), 0) as "max_seq!"
            FROM crdt.board_update
            WHERE board_id = $1
            "#,
            board_id
        )
        .fetch_one(pool)
    )?
    .max_seq)
}

pub async fn create_snapshot_and_cleanup(
    pool: &PgPool,
    board_id: Uuid,
    snapshot_seq: i64,
    state_bin: Vec<u8>,
) -> Result<(u64, u64), AppError> {
    let mut tx = pool.begin().await?;

    let insert_result = crate::log_query_execute!(
        "realtime.insert_snapshot",
        sqlx::query!(
            r#"
            INSERT INTO crdt.board_snapshot (board_id, snapshot_seq, state_bin)
            VALUES ($1, $2, $3)
            ON CONFLICT (board_id, snapshot_seq) DO NOTHING
            "#,
            board_id,
            snapshot_seq,
            state_bin
        )
        .execute(&mut *tx)
    )?;

    let delete_result = crate::log_query_execute!(
        "realtime.cleanup_updates",
        sqlx::query!(
            r#"
            DELETE FROM crdt.board_update
            WHERE board_id = $1 AND seq <= $2
            "#,
            board_id,
            snapshot_seq
        )
        .execute(&mut *tx)
    )?;

    tx.commit().await?;
    Ok((insert_result.rows_affected(), delete_result.rows_affected()))
}

pub async fn insert_snapshot(
    tx: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    snapshot_seq: i64,
    state_bin: Vec<u8>,
    created_by: Option<Uuid>,
) -> Result<(), AppError> {
    crate::log_query_execute!(
        "realtime.insert_snapshot_tx",
        sqlx::query!(
            r#"
                INSERT INTO crdt.board_snapshot (board_id, snapshot_seq, state_bin, created_by)
                VALUES ($1, $2, $3, $4)
            "#,
            board_id,
            snapshot_seq,
            state_bin,
            created_by
        )
        .execute(&mut **tx)
    )?;

    Ok(())
}
