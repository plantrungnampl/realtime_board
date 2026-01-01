use std::{ sync::Arc};

use sqlx::{PgPool};
use tokio::sync::Mutex;
use uuid::Uuid;
use yrs::{ Doc, ReadTxn, StateVector, Transact, merge_updates_v1, updates::decoder::Decode};

use crate::{
    error::AppError,
    models::boards::{Board, BoardElement, BoardResponse, CreateBoardRequest},
};
pub struct BoardService;

impl BoardService {
    pub async fn get_board(pool: &PgPool, user_id: Uuid) -> Result<Vec<BoardResponse>, AppError> {
        let result = sqlx::query_as::<_, BoardResponse>(
            r#"
                SELECT board.board.id, board.board.created_by, board.board.organization_id, board.board.name, board.board.description, board.board.thumbnail_url, board.board.created_at, board.board.updated_at, core.user.username
                FROM board.board
                JOIN core.user ON board.board.created_by = core.user.id
                where board.board.created_by = $1
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;
        Ok(result)
    }

    pub async fn create_board(
        pool: &PgPool,
        req: CreateBoardRequest,
        user_id: Uuid,
    ) -> Result<Board, AppError> {
        let board_result = sqlx::query_as(
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
        .fetch_one(pool)
        .await?;
        Ok(board_result)
    }
    // Loại bỏ
    pub async fn get_element(
        pool: &PgPool,
        board_id: Uuid,
    ) -> Result<Vec<BoardElement>, sqlx::Error> {
        let result = sqlx::query_as::<_, BoardElement>(
            r#"
            SELECT * FROM board.element WHERE board_id = $1
            "#,
        )
        .bind(board_id)
        .fetch_all(pool)
        .await?;
        println!("board result==: {:?}", result);
        Ok(result)
    }
  //ENd Loại bỏ

  
pub async fn save_update_logs(
    board_id: Uuid,
    actor_id: Option<Uuid>,
    updates: Vec<Vec<u8>>,
    pool: sqlx::PgPool
) {
    if updates.is_empty() {
        return;
    }
    let refs: Vec<&[u8]> = updates.iter().map(|v| v.as_slice()).collect();
    let merged_update = merge_updates_v1(&refs).unwrap();
        let result = sqlx::query!(
            r#"
            INSERT INTO crdt.board_update (board_id, actor_id, update_bin)
            VALUES ($1, $2, $3)
            "#,
            board_id,
            actor_id,
            merged_update
        )
        .execute(&pool)
        .await;

        if let Err(e) = result {
            tracing::error!("Failed to save update log for board {}: {:?}", board_id, e);
        }
}
// lấy dữ liệu từ db -> đắp vào biến doc tren ram
pub async fn load_board_state(pool: &PgPool,doc: Arc<Mutex<Doc>>, board_id: Uuid) -> Result<(), Box<dyn std::error::Error>> {
    // 1. Load Snapshot mới nhất (nếu có)
   let snapshot_record = sqlx::query!(
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
   .await?;

   let mut start_seq: i64 = 0;
   // nếu có snapshot apply nó trước
   if let Some(record) = snapshot_record {
    let doc_guard = doc.lock().await;
    let mut txn = doc_guard.transact_mut();
    let update = yrs::Update::decode_v1(&record.state_bin)?;
    let _ = txn.apply_update(update);
    start_seq = record.snapshot_seq;
    tracing::info!("LOADED SNAPSHOT FOR BOARD {} AT SEQ {}",board_id, start_seq);
   }
    // 2. Load và apply các update từ sau snapshot đến nay
   let updates = sqlx::query!(
    r#"
    SELECT update_bin ,seq FROM crdt.board_update 
    WHERE board_id = $1 AND seq > $2
    ORDER BY seq ASC
    "#,
    board_id,
    start_seq
   ).fetch_all(pool).await?;
    
   if !updates.is_empty() {
    let doc_guard = doc.lock().await;
    let mut txn = doc_guard.transact_mut();
    for row in &updates {
        //apply tung cai nho le
        if let Ok(u) = yrs::Update::decode_v1(&row.update_bin) {
            let _ = txn.apply_update(u);
        } else {
            tracing::error!("error update log seq {} for board {}",row.seq,board_id);
        }
    }
    tracing::info!("Replayed {} updates for board {}", updates.len(), board_id);
   }
   Ok(())
}


pub async fn maybe_create_snapshot(
    pool: &PgPool,
    board_id: Uuid,
    doc: Arc<Mutex<Doc>>,
    min_updates: i64,
) -> Result<bool, Box<dyn std::error::Error>> {
    let last_snapshot_seq = sqlx::query!(
        r#"
        SELECT COALESCE(MAX(snapshot_seq), 0) as "snapshot_seq!"
        FROM crdt.board_snapshot
        WHERE board_id = $1
        "#,
        board_id
    )
    .fetch_one(pool)
    .await?
    .snapshot_seq;

    let latest_seq = sqlx::query!(
        r#"
        SELECT COALESCE(MAX(seq), 0) as "max_seq!"
        FROM crdt.board_update
        WHERE board_id = $1
        "#,
        board_id
    )
    .fetch_one(pool)
    .await?
    .max_seq;

    if latest_seq == 0 || latest_seq <= last_snapshot_seq {
        return Ok(false);
    }
    if latest_seq - last_snapshot_seq < min_updates {
        return Ok(false);
    }

    Self::create_snapshot_with_seq(pool, board_id, doc, latest_seq).await?;
    Ok(true)
}

async fn create_snapshot_with_seq(
    pool: &PgPool,
    board_id: Uuid,
    doc: Arc<Mutex<Doc>>,
    snapshot_seq: i64,
) -> Result<(), Box<dyn std::error::Error>> {
    let snapshot_data = {
        let doc_guard = doc.lock().await;
        let txn = doc_guard.transact();
        txn.encode_state_as_update_v1(&StateVector::default())
    };

    let mut tx = pool.begin().await?;
    let insert_result = sqlx::query!(
        r#"
        INSERT INTO crdt.board_snapshot (board_id, snapshot_seq, state_bin)
        VALUES ($1, $2, $3)
        ON CONFLICT (board_id, snapshot_seq) DO NOTHING
        "#,
        board_id,
        snapshot_seq,
        snapshot_data
    )
    .execute(&mut *tx)
    .await?;

    let delete_result = sqlx::query!(
        r#"
        DELETE FROM crdt.board_update
        WHERE board_id = $1 AND seq <= $2
        "#,
        board_id,
        snapshot_seq
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    tracing::info!(
        "Snapshot board {} at seq {}, deleted {} updates (inserted={})",
        board_id,
        snapshot_seq,
        delete_result.rows_affected(),
        insert_result.rows_affected()
    );
    Ok(())

}
}
