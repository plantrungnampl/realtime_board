use std::{collections::HashMap, sync::Arc, time::Duration};

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use tokio::sync::Mutex;
use uuid::Uuid;
use yrs::Doc;

use crate::{
    error::AppError,
    realtime::{element_crdt, room::Room, room::Rooms},
    repositories::boards as board_repo,
    repositories::elements as element_repo,
    telemetry::BusinessEvent,
};

struct ProjectionFallback {
    created_by: Uuid,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

pub fn spawn_projection(db: PgPool, rooms: Rooms) {
    tokio::spawn(async move {
        const PROJECTION_INTERVAL_SECS: u64 = 2;
        let mut interval = tokio::time::interval(Duration::from_secs(PROJECTION_INTERVAL_SECS));
        loop {
            interval.tick().await;
            let rooms_snapshot: Vec<Arc<Room>> =
                rooms.iter().map(|entry| entry.value().clone()).collect();
            for room in rooms_snapshot {
                if let Err(error) = project_room(&db, &room).await {
                    tracing::error!(
                        "Failed to project board {} CRDT state: {}",
                        room.board_id,
                        error
                    );
                }
            }
        }
    });
}

pub async fn project_doc(
    db: &PgPool,
    board_id: Uuid,
    doc: Arc<Mutex<Doc>>,
) -> Result<(), AppError> {
    let elements = {
        let doc_guard = doc.lock().await;
        element_crdt::materialize_elements(&doc_guard)
    };
    project_elements(db, board_id, elements).await
}

async fn project_room(db: &PgPool, room: &Arc<Room>) -> Result<(), AppError> {
    let elements = {
        let doc_guard = room.doc.lock().await;
        element_crdt::materialize_elements(&doc_guard)
    };
    project_elements(db, room.board_id, elements).await
}

async fn project_elements(
    db: &PgPool,
    board_id: Uuid,
    elements: Vec<element_crdt::ElementMaterialized>,
) -> Result<(), AppError> {
    let element_count = elements.len();
    let board = board_repo::find_board_by_id_including_deleted(db, board_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Board not found".to_string()))?;
    let fallback = ProjectionFallback {
        created_by: board.created_by,
        created_at: board.created_at,
        updated_at: board.updated_at,
    };

    let mut tx = db.begin().await?;
    crate::log_query_execute!(
        "realtime.set_crdt_projection",
        sqlx::query("SELECT set_config('app.crdt_projection', 'on', true)")
            .execute(&mut *tx)
    )?;

    let defaults = element_repo::list_projection_defaults(db, board_id).await?;
    let defaults_map: HashMap<Uuid, element_repo::ElementProjectionDefaults> = defaults
        .into_iter()
        .map(|row| (row.id, row))
        .collect();
    for element in elements {
        let defaults = defaults_map.get(&element.id);
        match to_projected_params(board_id, element, defaults, &fallback) {
            Ok(params) => {
                element_repo::upsert_projected_element(&mut tx, params).await?;
            }
            Err(error) => {
                tracing::warn!(
                    "Skipping projection for board {}: {}",
                    board_id,
                    error
                );
            }
        }
    }
    tx.commit().await?;
    BusinessEvent::CrdtProjectionCompleted {
        board_id,
        elements_synced: element_count,
    }
    .log();
    Ok(())
}

fn to_projected_params(
    board_id: Uuid,
    element: element_crdt::ElementMaterialized,
    defaults: Option<&element_repo::ElementProjectionDefaults>,
    fallback: &ProjectionFallback,
) -> Result<element_repo::ProjectedElementParams, AppError> {
    let rotation = normalize_rotation(element.rotation);
    let (width, height) = normalize_dimensions(board_id, element.id, element.width, element.height);
    let created_by = defaults
        .map(|row| row.created_by)
        .or(element.created_by);
    let created_at = defaults
        .map(|row| row.created_at)
        .or(element.created_at);
    let updated_at = element
        .updated_at
        .or_else(|| defaults.map(|row| row.updated_at));
    let version = element
        .version
        .or_else(|| defaults.map(|row| row.version));

    let created_by = created_by.unwrap_or(fallback.created_by);
    let created_at = created_at.unwrap_or(fallback.created_at);
    let updated_at = updated_at.unwrap_or(fallback.updated_at);
    let version = version.unwrap_or(1);

    Ok(element_repo::ProjectedElementParams {
        id: element.id,
        board_id,
        layer_id: element.layer_id,
        parent_id: element.parent_id,
        created_by,
        element_type: element.element_type,
        position_x: element.position_x,
        position_y: element.position_y,
        width,
        height,
        rotation,
        z_index: element.z_index,
        style: element.style,
        properties: element.properties,
        metadata: element.metadata,
        version,
        created_at,
        updated_at,
        deleted_at: element.deleted_at,
    })
}

fn normalize_dimensions(board_id: Uuid, element_id: Uuid, width: f64, height: f64) -> (f64, f64) {
    const MIN_DIMENSION: f64 = 1.0;
    let normalized_width = if width.is_finite() && width > 0.0 {
        width
    } else {
        MIN_DIMENSION
    };
    let normalized_height = if height.is_finite() && height > 0.0 {
        height
    } else {
        MIN_DIMENSION
    };

    if normalized_width != width || normalized_height != height {
        tracing::warn!(
            "Normalized non-positive element dimensions for board {} element {}: width {} -> {}, height {} -> {}",
            board_id,
            element_id,
            width,
            normalized_width,
            height,
            normalized_height
        );
    }

    (normalized_width, normalized_height)
}

fn normalize_rotation(value: f64) -> f64 {
    if !value.is_finite() {
        return 0.0;
    }
    let mut normalized = value % 360.0;
    if normalized < 0.0 {
        normalized += 360.0;
    }
    if normalized >= 360.0 {
        0.0
    } else {
        normalized
    }
}
