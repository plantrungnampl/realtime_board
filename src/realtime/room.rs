use axum::body::Bytes;
use dashmap::{DashMap, DashSet, Entry};
use sqlx::PgPool;
use std::{
    collections::VecDeque,
    sync::{Arc, atomic::AtomicU64},
    time::Instant,
};
use tokio::sync::{Mutex, Notify, RwLock, broadcast};
use uuid::Uuid;
use yrs::{Doc, sync::Awareness};

use crate::realtime::snapshot;

pub struct QueuedSession {
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub notify: Arc<Notify>,
}

pub struct Room {
    pub doc: Arc<Mutex<Doc>>,
    pub tx: broadcast::Sender<Bytes>,
    pub text_tx: broadcast::Sender<String>,
    pub board_id: Uuid,
    pub sessions: Arc<RwLock<DashSet<Uuid>>>,
    pub queue: Arc<Mutex<VecDeque<QueuedSession>>>,
    pub awareness: Arc<RwLock<Awareness>>,
    pub edit_permissions: Arc<DashMap<Uuid, bool>>,
    pub pending_updates: Arc<Mutex<Vec<Vec<u8>>>>,
    pub last_active: Mutex<Instant>,
    pub last_save: Mutex<Instant>,
    pub pending_update_count: AtomicU64,
    pub projection_seq: AtomicU64,
    pub projected_seq: AtomicU64,
}

impl Room {
    pub fn new(board_id: Uuid) -> Self {
        let (tx, _rx) = broadcast::channel(100);
        let (text_tx, _text_rx) = broadcast::channel(100);
        let doc = Arc::new(Mutex::new(Doc::new()));
        let awareness = Arc::new(RwLock::new(Awareness::new(Doc::new())));
        let pending_updates = Arc::new(Mutex::new(Vec::new()));
        let last_save = Mutex::new(Instant::now());
        let sessions = Arc::new(RwLock::new(DashSet::new()));
        let edit_permissions = Arc::new(DashMap::new());
        let queue = Arc::new(Mutex::new(VecDeque::new()));
        let last_active = Mutex::new(Instant::now());
        let pending_update_count = AtomicU64::new(0);
        let projection_seq = AtomicU64::new(0);
        let projected_seq = AtomicU64::new(0);
        Self {
            doc,
            tx,
            text_tx,
            board_id,
            sessions,
            queue,
            awareness,
            edit_permissions,
            pending_updates,
            last_active,
            last_save,
            pending_update_count,
            projection_seq,
            projected_seq,
        }
    }

    pub async fn enqueue_session(&self, session_id: Uuid, user_id: Uuid) -> (Arc<Notify>, usize) {
        let notify = Arc::new(Notify::new());
        let mut queue = self.queue.lock().await;
        queue.push_back(QueuedSession {
            session_id,
            user_id,
            notify: notify.clone(),
        });
        (notify, queue.len())
    }

    pub async fn remove_queued_session(&self, session_id: Uuid) -> bool {
        let mut queue = self.queue.lock().await;
        let before = queue.len();
        queue.retain(|entry| entry.session_id != session_id);
        before != queue.len()
    }

    pub async fn pop_next_queued(&self) -> Option<QueuedSession> {
        let mut queue = self.queue.lock().await;
        queue.pop_front()
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
