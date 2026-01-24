use sqlx::PgPool;
use std::{sync::Arc, time::Instant};
use tokio::sync::Mutex;
use tokio::time::{Duration, timeout};
use uuid::Uuid;
use yrs::{Doc, ReadTxn, StateVector, Transact, merge_updates_v1, updates::decoder::Decode};

use crate::{
    error::AppError,
    models::elements::BoardElement,
    realtime::element_crdt::{self, ElementSnapshot},
    realtime::room::{Room, Rooms},
    repositories::elements as element_repo,
    repositories::realtime as realtime_repo,
    telemetry::BusinessEvent,
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
    let started_at = Instant::now();
    tracing::info!("load_board_state start for board {}", board_id);
    let mut start_seq: i64 = 0;
    if let Some((seq, state_bin)) = realtime_repo::latest_snapshot(pool, board_id).await? {
        tracing::info!(
            "load_board_state snapshot found for board {} at seq {} ({} bytes)",
            board_id,
            seq,
            state_bin.len()
        );
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
    } else {
        tracing::info!("load_board_state no snapshot for board {}", board_id);
    }

    let updates = realtime_repo::updates_after_seq(pool, board_id, start_seq).await?;
    let update_count = updates.len();
    let update_bytes: usize = updates.iter().map(|(_, bin)| bin.len()).sum();

    if !updates.is_empty() {
        let skip_seq = std::env::var("RTC_SKIP_UPDATE_SEQ")
            .ok()
            .and_then(|value| value.parse::<i64>().ok());
        tracing::info!(
            "load_board_state applying {} updates ({} bytes) for board {} after seq {}",
            update_count,
            update_bytes,
            board_id,
            start_seq
        );
        for (index, (seq, update_bin)) in updates.iter().enumerate() {
            if skip_seq == Some(*seq) {
                tracing::warn!(
                    "load_board_state skipping update seq {} for board {} via RTC_SKIP_UPDATE_SEQ",
                    seq,
                    board_id
                );
                continue;
            }
            tracing::info!(
                "load_board_state apply update {}/{} seq {} ({} bytes) for board {}",
                index + 1,
                update_count,
                seq,
                update_bin.len(),
                board_id
            );
            let update = match yrs::Update::decode_v1(update_bin) {
                Ok(update) => update,
                Err(error) => {
                    tracing::error!(
                        "load_board_state failed to decode update seq {} for board {}: {}",
                        seq,
                        board_id,
                        error
                    );
                    continue;
                }
            };
            let doc_guard = doc.lock().await;
            let mut txn = doc_guard.transact_mut();
            if let Err(error) = txn.apply_update(update) {
                tracing::error!(
                    "load_board_state failed to apply update seq {} for board {}: {}",
                    seq,
                    board_id,
                    error
                );
            }
            drop(txn);
            drop(doc_guard);
            tokio::task::yield_now().await;
        }
        tracing::info!(
            "load_board_state replayed {} updates ({} bytes) and released doc lock for board {}",
            update_count,
            update_bytes,
            board_id
        );
    } else {
        tracing::info!(
            "load_board_state no updates for board {} after seq {}",
            board_id,
            start_seq
        );
    }
    tracing::info!("load_board_state before hydrate for board {}", board_id);
    if let Err(error) = hydrate_missing_fields_from_db(pool, doc.clone(), board_id).await {
        tracing::warn!(
            "Failed to hydrate missing element fields for board {}: {}",
            board_id,
            error
        );
    }
    tracing::info!("load_board_state after hydrate for board {}", board_id);
    if update_count >= 50 || update_bytes >= 5_000_000 {
        tracing::info!(
            "load_board_state snapshot-on-load trigger for board {} ({} updates, {} bytes)",
            board_id,
            update_count,
            update_bytes
        );
        if let Err(error) = maybe_create_snapshot(pool, board_id, doc.clone(), 1).await {
            tracing::warn!(
                "load_board_state snapshot-on-load failed for board {}: {}",
                board_id,
                error
            );
        }
    }
    tracing::info!(
        "load_board_state finished for board {} in {:?}",
        board_id,
        started_at.elapsed()
    );
    Ok(())
}

pub async fn build_state_update(
    pool: &PgPool,
    board_id: Uuid,
) -> Result<Vec<u8>, AppError> {
    let doc = Arc::new(Mutex::new(Doc::new()));
    load_board_state(pool, doc.clone(), board_id)
        .await
        .map_err(|error| {
            AppError::Internal(format!("Failed to build template state: {}", error))
        })?;
    let doc_guard = doc.lock().await;
    let txn = doc_guard.transact();
    Ok(txn.encode_state_as_update_v1(&StateVector::default()))
}

async fn hydrate_missing_fields_from_db(
    pool: &PgPool,
    doc: Arc<Mutex<Doc>>,
    board_id: Uuid,
) -> Result<(), AppError> {
    let started_at = Instant::now();
    const HYDRATE_QUERY_TIMEOUT: Duration = Duration::from_secs(5);
    tracing::info!(
        "hydrate_missing_fields_from_db start for board {}",
        board_id
    );
    let elements = match timeout(
        HYDRATE_QUERY_TIMEOUT,
        element_repo::list_elements_by_board_including_deleted(pool, board_id),
    )
    .await
    {
        Ok(result) => result?,
        Err(_) => {
            tracing::warn!(
                "hydrate_missing_fields_from_db timed out for board {} after {:?}",
                board_id,
                HYDRATE_QUERY_TIMEOUT
            );
            return Ok(());
        }
    };
    if elements.is_empty() {
        tracing::info!(
            "hydrate_missing_fields_from_db no elements for board {}",
            board_id
        );
        return Ok(());
    }
    tracing::info!(
        "hydrate_missing_fields_from_db loaded {} elements for board {}",
        elements.len(),
        board_id
    );

    let mut updates: Vec<Vec<u8>> = Vec::new();
    {
        let doc_guard = doc.lock().await;
        for element in elements {
            let snapshot = ElementSnapshot {
                id: element.id,
                board_id: element.board_id,
                layer_id: element.layer_id,
                parent_id: element.parent_id,
                created_by: element.created_by,
                element_type: element.element_type,
                position_x: element.position_x,
                position_y: element.position_y,
                width: element.width,
                height: element.height,
                rotation: element.rotation,
                z_index: element.z_index,
                style: element.style.clone(),
                properties: element.properties.clone(),
                metadata: element.metadata.clone(),
                created_at: element.created_at,
                updated_at: element.updated_at,
                deleted_at: element.deleted_at,
                version: element.version,
            };
            if let Some(applied) = element_crdt::apply_missing_fields(&doc_guard, &snapshot)? {
                updates.push(applied.update);
            }
        }
    }

    if updates.is_empty() {
        tracing::info!(
            "hydrate_missing_fields_from_db no missing fields for board {}",
            board_id
        );
        return Ok(());
    }

    let refs: Vec<&[u8]> = updates.iter().map(|v| v.as_slice()).collect();
    let merged_update = merge_updates_v1(&refs).map_err(|error| {
        AppError::Internal(format!("Failed to merge hydration updates: {}", error))
    })?;
    realtime_repo::insert_update_log(pool, board_id, None, merged_update).await?;
    tracing::info!(
        "hydrate_missing_fields_from_db wrote merged update for board {} in {:?}",
        board_id,
        started_at.elapsed()
    );
    Ok(())
}

pub fn build_state_update_from_elements(
    elements: &[BoardElement],
) -> Result<Vec<u8>, AppError> {
    if elements.is_empty() {
        return Ok(Vec::new());
    }
    let doc = Doc::new();
    for element in elements {
        let snapshot = ElementSnapshot {
            id: element.id,
            board_id: element.board_id,
            layer_id: element.layer_id,
            parent_id: element.parent_id,
            created_by: element.created_by,
            element_type: element.element_type,
            position_x: element.position_x,
            position_y: element.position_y,
            width: element.width,
            height: element.height,
            rotation: element.rotation,
            z_index: element.z_index,
            style: element.style.clone(),
            properties: element.properties.clone(),
            metadata: element.metadata.clone(),
            created_at: element.created_at,
            updated_at: element.updated_at,
            deleted_at: element.deleted_at,
            version: element.version,
        };
        element_crdt::apply_snapshot(&doc, &snapshot)?;
    }

    let txn = doc.transact();
    Ok(txn.encode_state_as_update_v1(&StateVector::default()))
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

    let snapshot_size = snapshot_data.len();
    let (inserted, deleted) =
        realtime_repo::create_snapshot_and_cleanup(pool, board_id, snapshot_seq, snapshot_data)
            .await?;
    BusinessEvent::CrdtSnapshotSaved {
        board_id,
        snapshot_size,
        update_count: deleted as usize,
    }
    .log();
    tracing::info!(
        "Snapshot board {} at seq {}, deleted {} updates (inserted={})",
        board_id,
        snapshot_seq,
        deleted,
        inserted
    );
    Ok(())
}
