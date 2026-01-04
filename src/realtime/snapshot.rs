use sqlx::PgPool;
use std::{sync::Arc, time::Instant};
use tokio::sync::Mutex;
use uuid::Uuid;
use yrs::{Doc, ReadTxn, StateVector, Transact, merge_updates_v1, updates::decoder::Decode};

use crate::{
    realtime::room::{Room, Rooms},
    repositories::realtime as realtime_repo,
};

pub fn spawn_maintenance(db: PgPool, rooms: Rooms) {
    tokio::spawn(async move {
        const SNAPSHOT_INTERVAL_SECS: u64 = 60;
        const SNAPSHOT_MIN_UPDATES: i64 = 200;
        const CLEANUP_INTERVAL_SECS: u64 = 300;

        let mut snapshot_interval =
            tokio::time::interval(std::time::Duration::from_secs(SNAPSHOT_INTERVAL_SECS));
        let mut cleanup_interval =
            tokio::time::interval(std::time::Duration::from_secs(CLEANUP_INTERVAL_SECS));

        loop {
            tokio::select! {
                _ = snapshot_interval.tick() => {
                    let rooms_snapshot: Vec<Arc<Room>> = rooms.iter().map(|entry| entry.value().clone()).collect();
                    for room in rooms_snapshot {
                        let pending_updates = {
                            let mut pending = room.pending_updates.lock().await;
                            if pending.is_empty() {
                                Vec::new()
                            } else {
                                pending.drain(..).collect()
                            }
                        };

                        if !pending_updates.is_empty() {
                            save_update_logs(room.board_id, None, pending_updates, db.clone()).await;
                            let mut last_save = room.last_save.lock().await;
                            *last_save = Instant::now();
                        }

                        if let Err(e) = maybe_create_snapshot(&db, room.board_id, room.doc.clone(), SNAPSHOT_MIN_UPDATES).await {
                            tracing::error!("Failed to create snapshot for board {}: {}", room.board_id, e);
                        }
                    }
                }
                _ = cleanup_interval.tick() => {
                    let mut room_to_remove = Vec::new();
                    for room in rooms.iter() {
                        let last_active = room.value().last_active.lock().await;
                        if last_active.elapsed().as_secs() >= CLEANUP_INTERVAL_SECS {
                            room_to_remove.push(*room.key());
                        }
                    }
                    for board_id in room_to_remove {
                        rooms.remove(&board_id);
                        tracing::info!("Removed inactive room for board {}", board_id);
                    }
                }
            }
        }
    });
}

pub async fn save_update_logs(
    board_id: Uuid,
    actor_id: Option<Uuid>,
    updates: Vec<Vec<u8>>,
    pool: PgPool,
) {
    if updates.is_empty() {
        return;
    }
    let refs: Vec<&[u8]> = updates.iter().map(|v| v.as_slice()).collect();
    let merged_update = merge_updates_v1(&refs).unwrap();
    if let Err(e) = realtime_repo::insert_update_log(&pool, board_id, actor_id, merged_update).await
    {
        tracing::error!("Failed to save update log for board {}: {:?}", board_id, e);
    }
}

pub async fn load_board_state(
    pool: &PgPool,
    doc: Arc<Mutex<Doc>>,
    board_id: Uuid,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut start_seq: i64 = 0;
    if let Some((seq, state_bin)) = realtime_repo::latest_snapshot(pool, board_id).await? {
        let doc_guard = doc.lock().await;
        let mut txn = doc_guard.transact_mut();
        let update = yrs::Update::decode_v1(&state_bin)?;
        let _ = txn.apply_update(update);
        start_seq = seq;
        tracing::info!(
            "LOADED SNAPSHOT FOR BOARD {} AT SEQ {}",
            board_id,
            start_seq
        );
    }

    let updates = realtime_repo::updates_after_seq(pool, board_id, start_seq).await?;

    if !updates.is_empty() {
        let doc_guard = doc.lock().await;
        let mut txn = doc_guard.transact_mut();
        for (seq, update_bin) in &updates {
            if let Ok(u) = yrs::Update::decode_v1(update_bin) {
                let _ = txn.apply_update(u);
            } else {
                tracing::error!("error update log seq {} for board {}", seq, board_id);
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
    let last_snapshot_seq = realtime_repo::last_snapshot_seq(pool, board_id).await?;
    let latest_seq = realtime_repo::latest_update_seq(pool, board_id).await?;

    if latest_seq == 0 || latest_seq <= last_snapshot_seq {
        return Ok(false);
    }
    if latest_seq - last_snapshot_seq < min_updates {
        return Ok(false);
    }

    create_snapshot_with_seq(pool, board_id, doc, latest_seq).await?;
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

    let (inserted, deleted) =
        realtime_repo::create_snapshot_and_cleanup(pool, board_id, snapshot_seq, snapshot_data)
            .await?;
    tracing::info!(
        "Snapshot board {} at seq {}, deleted {} updates (inserted={})",
        board_id,
        snapshot_seq,
        deleted,
        inserted
    );
    Ok(())
}
