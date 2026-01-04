use axum::body::Bytes;
use dashmap::{DashMap, DashSet, Entry};
use sqlx::PgPool;
use std::{sync::Arc, time::Instant};
use tokio::sync::{Mutex, RwLock, broadcast};
use uuid::Uuid;
use yrs::{Doc, sync::Awareness};

use crate::realtime::snapshot;

pub struct Room {
    pub doc: Arc<Mutex<Doc>>,
    pub tx: broadcast::Sender<Bytes>,
    pub board_id: Uuid,
    pub user: Arc<RwLock<DashSet<Uuid>>>,
    pub awareness: Arc<RwLock<Awareness>>,
    pub pending_updates: Arc<Mutex<Vec<Vec<u8>>>>,
    pub last_active: Mutex<Instant>,
    pub last_save: Mutex<Instant>,
}

impl Room {
    pub fn new(board_id: Uuid) -> Self {
        let (tx, _rx) = broadcast::channel(100);
        let doc = Arc::new(Mutex::new(Doc::new()));
        let awareness = Arc::new(RwLock::new(Awareness::new(Doc::new())));
        let pending_updates = Arc::new(Mutex::new(Vec::new()));
        let last_save = Mutex::new(Instant::now());
        let user = Arc::new(RwLock::new(DashSet::new()));
        let last_active = Mutex::new(Instant::now());
        Self {
            doc,
            tx,
            board_id,
            user,
            awareness,
            pending_updates,
            last_active,
            last_save,
        }
    }
}

pub type Rooms = Arc<DashMap<Uuid, Arc<Room>>>;

pub async fn get_or_load_room(
    rooms: &Rooms,
    db: &PgPool,
    board_id: Uuid,
) -> Result<Arc<Room>, String> {
    if let Some(room) = rooms.get(&board_id) {
        return Ok(room.clone());
    }

    let new_room = Arc::new(Room::new(board_id));
    snapshot::load_board_state(db, new_room.doc.clone(), board_id)
        .await
        .map_err(|e| format!("Failed to load board state: {}", e))?;

    match rooms.entry(board_id) {
        Entry::Occupied(entry) => Ok(entry.get().clone()),
        Entry::Vacant(entry) => {
            entry.insert(new_room.clone());
            Ok(new_room)
        }
    }
}
