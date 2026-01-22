use std::sync::Arc;
use std::time::Instant;

use axum::body::Bytes;
use sqlx::PgPool;
use tokio::sync::Mutex;
use uuid::Uuid;
use yrs::Doc;

use crate::{
    dto::elements::UpdateBoardElementRequest,
    error::AppError,
    realtime::{
        element_crdt::{self, AppliedElement, ElementMaterialized, ElementSnapshot},
        projection,
        protocol,
        room::Rooms,
        snapshot,
    },
    repositories::realtime as realtime_repo,
};

pub struct DeletedApplied {
    pub applied: AppliedElement,
    pub was_deleted: bool,
}

pub async fn apply_element_snapshot(
    rooms: &Rooms,
    db: &PgPool,
    actor_id: Uuid,
    snapshot: &ElementSnapshot,
) -> Result<AppliedElement, AppError> {
    let board_id = snapshot.board_id;
    if let Some(room_entry) = rooms.get(&board_id) {
        let room = room_entry.clone();
        drop(room_entry);

        let applied = {
            let doc_guard = room.doc.lock().await;
            element_crdt::apply_snapshot(&doc_guard, snapshot)?
        };
        broadcast_update(&room, applied.update.clone()).await;
        return Ok(applied);
    }

    let (doc, applied) = apply_with_loaded_doc(db, board_id, |doc| {
        element_crdt::apply_snapshot(doc, snapshot).map(Some)
    })
    .await?;

    if let Some(applied) = applied {
        persist_update(db, board_id, actor_id, &applied.update).await?;
        projection::project_doc(db, board_id, doc).await?;
        Ok(applied)
    } else {
        Err(AppError::Internal(
            "Failed to apply element snapshot".to_string(),
        ))
    }
}

pub async fn apply_element_update(
    rooms: &Rooms,
    db: &PgPool,
    actor_id: Uuid,
    board_id: Uuid,
    element_id: Uuid,
    req: &UpdateBoardElementRequest,
    updated_at: chrono::DateTime<chrono::Utc>,
) -> Result<Option<AppliedElement>, AppError> {
    if let Some(room_entry) = rooms.get(&board_id) {
        let room = room_entry.clone();
        drop(room_entry);

        let applied = {
            let doc_guard = room.doc.lock().await;
            element_crdt::apply_update(&doc_guard, element_id, req, updated_at)?
        };
        if let Some(applied) = applied.as_ref() {
            broadcast_update(&room, applied.update.clone()).await;
        }
        return Ok(applied);
    }

    let (doc, applied) = apply_with_loaded_doc(db, board_id, |doc| {
        element_crdt::apply_update(doc, element_id, req, updated_at)
    })
    .await?;

    if let Some(applied) = applied.as_ref() {
        persist_update(db, board_id, actor_id, &applied.update).await?;
        projection::project_doc(db, board_id, doc).await?;
    }

    Ok(applied)
}

pub async fn apply_element_deleted(
    rooms: &Rooms,
    db: &PgPool,
    actor_id: Uuid,
    board_id: Uuid,
    element_id: Uuid,
    deleted_at: Option<chrono::DateTime<chrono::Utc>>,
    updated_at: chrono::DateTime<chrono::Utc>,
) -> Result<Option<DeletedApplied>, AppError> {
    if let Some(room_entry) = rooms.get(&board_id) {
        let room = room_entry.clone();
        drop(room_entry);

        let result = {
            let doc_guard = room.doc.lock().await;
            let existing = element_crdt::materialize_element(&doc_guard, element_id);
            let was_deleted = existing.and_then(|element| element.deleted_at).is_some();
            let applied = element_crdt::apply_deleted(&doc_guard, element_id, deleted_at, updated_at)?;
            applied.map(|applied| DeletedApplied { applied, was_deleted })
        };

        if let Some(result) = result.as_ref() {
            broadcast_update(&room, result.applied.update.clone()).await;
        }
        return Ok(result);
    }

    let (doc, result) = apply_with_loaded_doc(db, board_id, |doc| {
        let existing = element_crdt::materialize_element(doc, element_id);
        let was_deleted = existing.and_then(|element| element.deleted_at).is_some();
        let applied = element_crdt::apply_deleted(doc, element_id, deleted_at, updated_at)?;
        Ok(applied.map(|applied| DeletedApplied { applied, was_deleted }))
    })
    .await?;

    if let Some(result) = result.as_ref() {
        persist_update(db, board_id, actor_id, &result.applied.update).await?;
        projection::project_doc(db, board_id, doc).await?;
    }

    Ok(result)
}

pub async fn next_z_index(
    rooms: &Rooms,
    db: &PgPool,
    board_id: Uuid,
    layer_id: Option<Uuid>,
) -> Result<i32, AppError> {
    if let Some(room_entry) = rooms.get(&board_id) {
        let room = room_entry.clone();
        drop(room_entry);

        let max = {
            let doc_guard = room.doc.lock().await;
            element_crdt::max_z_index(&doc_guard, layer_id)
        };
        return Ok(max + 1);
    }

    let doc = load_doc(db, board_id).await?;
    let doc_guard = doc.lock().await;
    let max = element_crdt::max_z_index(&doc_guard, layer_id);
    Ok(max + 1)
}

pub async fn load_element_materialized(
    rooms: &Rooms,
    db: &PgPool,
    board_id: Uuid,
    element_id: Uuid,
) -> Result<Option<ElementMaterialized>, AppError> {
    if let Some(room_entry) = rooms.get(&board_id) {
        let room = room_entry.clone();
        drop(room_entry);

        let element = {
            let doc_guard = room.doc.lock().await;
            element_crdt::materialize_element(&doc_guard, element_id)
        };
        return Ok(element);
    }

    let doc = load_doc(db, board_id).await?;
    let doc_guard = doc.lock().await;
    let element = element_crdt::materialize_element(&doc_guard, element_id);
    Ok(element)
}

async fn apply_with_loaded_doc<T, F>(
    db: &PgPool,
    board_id: Uuid,
    apply: F,
) -> Result<(Arc<Mutex<Doc>>, T), AppError>
where
    F: FnOnce(&Doc) -> Result<T, AppError>,
{
    let doc = load_doc(db, board_id).await?;

    let applied = {
        let doc_guard = doc.lock().await;
        apply(&doc_guard)?
    };

    Ok((doc, applied))
}

async fn load_doc(db: &PgPool, board_id: Uuid) -> Result<Arc<Mutex<Doc>>, AppError> {
    let doc = Arc::new(Mutex::new(Doc::new()));
    snapshot::load_board_state(db, doc.clone(), board_id)
        .await
        .map_err(|error| AppError::Internal(format!("Failed to load board state: {}", error)))?;
    Ok(doc)
}

async fn persist_update(
    db: &PgPool,
    board_id: Uuid,
    actor_id: Uuid,
    update: &[u8],
) -> Result<(), AppError> {
    if update.is_empty() {
        return Ok(());
    }
    realtime_repo::insert_update_log(db, board_id, Some(actor_id), update.to_vec()).await
}

async fn broadcast_update(room: &Arc<crate::realtime::room::Room>, update: Vec<u8>) {
    if update.is_empty() {
        return;
    }
    {
        let mut pending = room.pending_updates.lock().await;
        pending.push(update.clone());
    }
    *room.last_active.lock().await = Instant::now();

    let mut message = vec![protocol::OP_UPDATE];
    message.extend(update);
    let _ = room.tx.send(Bytes::from(message));
}
