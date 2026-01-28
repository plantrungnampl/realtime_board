use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    dto::elements::{
        BoardElementResponse, CreateBoardElementRequest, DeleteBoardElementResponse,
        RestoreBoardElementResponse, UpdateBoardElementRequest,
    },
    error::AppError,
    realtime::{
        element_crdt::{ElementMaterialized, ElementSnapshot},
        elements as realtime_elements,
        room::Rooms,
    },
    usecases::boards::BoardService,
};

const MAX_ROTATION: f64 = 360.0;

pub struct ElementService;

impl ElementService {
    pub async fn create_element(
        pool: &PgPool,
        rooms: &Rooms,
        board_id: Uuid,
        user_id: Uuid,
        req: CreateBoardElementRequest,
    ) -> Result<BoardElementResponse, AppError> {
        ensure_can_edit(pool, board_id, user_id).await?;
        validate_rotation(req.rotation)?;
        validate_position(req.position_x, req.position_y)?;

        let (position_x, width) = normalize_dimension(req.position_x, req.width);
        let (position_y, height) = normalize_dimension(req.position_y, req.height);
        validate_dimensions(width, height)?;

        let z_index = realtime_elements::next_z_index(rooms, pool, board_id, req.layer_id).await?;
        let style = req.style.unwrap_or_else(default_style);
        let properties = req.properties.unwrap_or_else(default_properties);
        let metadata = req.metadata.unwrap_or_else(default_metadata);
        let now = Utc::now();

        let snapshot = ElementSnapshot {
            id: req.id.unwrap_or_else(Uuid::now_v7),
            board_id,
            layer_id: req.layer_id,
            parent_id: req.parent_id,
            created_by: user_id,
            element_type: req.element_type,
            position_x,
            position_y,
            width,
            height,
            rotation: req.rotation.unwrap_or(0.0),
            z_index,
            style,
            properties,
            metadata,
            created_at: now,
            updated_at: now,
            deleted_at: None,
            version: 1,
        };

        let applied =
            realtime_elements::apply_element_snapshot(rooms, pool, user_id, &snapshot).await?;
        materialized_to_response(applied.element)
    }

    pub async fn update_element(
        pool: &PgPool,
        rooms: &Rooms,
        board_id: Uuid,
        element_id: Uuid,
        user_id: Uuid,
        req: UpdateBoardElementRequest,
    ) -> Result<BoardElementResponse, AppError> {
        ensure_can_edit(pool, board_id, user_id).await?;
        validate_expected_version(req.expected_version)?;
        validate_rotation(req.rotation)?;
        validate_optional_coordinate(req.position_x, "position_x")?;
        validate_optional_coordinate(req.position_y, "position_y")?;
        validate_optional_dimension(req.width, "width")?;
        validate_optional_dimension(req.height, "height")?;

        let updated_at = Utc::now();
        let applied = realtime_elements::apply_element_update(
            rooms, pool, user_id, board_id, element_id, &req, updated_at,
        )
        .await?;

        let Some(applied) = applied else {
            return Err(AppError::NotFound("Element not found".to_string()));
        };

        materialized_to_response(applied.element)
    }

    pub async fn delete_element(
        pool: &PgPool,
        rooms: &Rooms,
        board_id: Uuid,
        element_id: Uuid,
        user_id: Uuid,
        expected_version: i32,
    ) -> Result<DeleteBoardElementResponse, AppError> {
        ensure_can_edit(pool, board_id, user_id).await?;
        validate_expected_version(expected_version)?;

        let now = Utc::now();
        let result = realtime_elements::apply_element_deleted(
            rooms,
            pool,
            user_id,
            board_id,
            element_id,
            Some(now),
            now,
        )
        .await?;

        let Some(result) = result else {
            return Err(AppError::NotFound("Element not found".to_string()));
        };

        let (version, deleted_at, updated_at) = extract_delete_fields(&result.applied.element)?;
        Ok(DeleteBoardElementResponse {
            id: result.applied.element.id,
            version,
            deleted_at,
            updated_at,
            already_deleted: if result.was_deleted { Some(true) } else { None },
        })
    }

    pub async fn restore_element(
        pool: &PgPool,
        rooms: &Rooms,
        board_id: Uuid,
        element_id: Uuid,
        user_id: Uuid,
        expected_version: i32,
    ) -> Result<RestoreBoardElementResponse, AppError> {
        ensure_can_edit(pool, board_id, user_id).await?;
        validate_expected_version(expected_version)?;

        let existing =
            realtime_elements::load_element_materialized(rooms, pool, board_id, element_id).await?;
        let Some(existing) = existing else {
            return Err(AppError::NotFound("Element not found".to_string()));
        };

        if existing.deleted_at.is_none() {
            let version = require_field(existing.version, "version")?;
            let updated_at = require_field(existing.updated_at, "updated_at")?;
            return Ok(RestoreBoardElementResponse {
                id: existing.id,
                version,
                deleted_at: existing.deleted_at,
                updated_at,
            });
        }

        let now = Utc::now();
        let result = realtime_elements::apply_element_deleted(
            rooms, pool, user_id, board_id, element_id, None, now,
        )
        .await?;

        let Some(result) = result else {
            return Err(AppError::NotFound("Element not found".to_string()));
        };

        let version = require_field(result.applied.element.version, "version")?;
        let updated_at = require_field(result.applied.element.updated_at, "updated_at")?;

        Ok(RestoreBoardElementResponse {
            id: result.applied.element.id,
            version,
            deleted_at: result.applied.element.deleted_at,
            updated_at,
        })
    }
}

fn materialized_to_response(
    element: ElementMaterialized,
) -> Result<BoardElementResponse, AppError> {
    let created_by = require_field(element.created_by, "created_by")?;
    let created_at = require_field(element.created_at, "created_at")?;
    let updated_at = require_field(element.updated_at, "updated_at")?;
    let version = require_field(element.version, "version")?;

    Ok(BoardElementResponse {
        id: element.id,
        board_id: element.board_id,
        layer_id: element.layer_id,
        parent_id: element.parent_id,
        created_by,
        element_type: element.element_type,
        position_x: element.position_x,
        position_y: element.position_y,
        width: element.width,
        height: element.height,
        rotation: element.rotation,
        z_index: element.z_index,
        style: element.style,
        properties: element.properties,
        version,
        metadata: element.metadata,
        created_at,
        updated_at,
    })
}

fn extract_delete_fields(
    element: &ElementMaterialized,
) -> Result<(i32, DateTime<Utc>, DateTime<Utc>), AppError> {
    let version = require_field(element.version, "version")?;
    let deleted_at = element
        .deleted_at
        .ok_or_else(|| AppError::Internal("Deleted element missing deleted_at".to_string()))?;
    let updated_at = require_field(element.updated_at, "updated_at")?;
    Ok((version, deleted_at, updated_at))
}

fn require_field<T>(value: Option<T>, label: &str) -> Result<T, AppError> {
    value.ok_or_else(|| AppError::Internal(format!("Missing element {}", label)))
}

async fn ensure_can_edit(pool: &PgPool, board_id: Uuid, user_id: Uuid) -> Result<(), AppError> {
    let permissions = BoardService::get_access_permissions(pool, board_id, user_id).await?;
    if !permissions.can_edit {
        return Err(AppError::Forbidden(
            "You do not have permission to edit this board".to_string(),
        ));
    }
    Ok(())
}

fn validate_dimensions(width: f64, height: f64) -> Result<(), AppError> {
    if !width.is_finite() || !height.is_finite() {
        return Err(AppError::ValidationError(
            "Element dimensions must be finite numbers".to_string(),
        ));
    }
    if width <= 0.0 || height <= 0.0 {
        return Err(AppError::ValidationError(
            "Element dimensions must be positive".to_string(),
        ));
    }
    Ok(())
}

fn validate_expected_version(version: i32) -> Result<(), AppError> {
    if version < 1 {
        return Err(AppError::ValidationError(
            "Expected version must be positive".to_string(),
        ));
    }
    Ok(())
}

fn validate_rotation(rotation: Option<f64>) -> Result<(), AppError> {
    let Some(value) = rotation else {
        return Ok(());
    };
    if !value.is_finite() {
        return Err(AppError::ValidationError(
            "Rotation must be a finite number".to_string(),
        ));
    }
    if value < 0.0 || value >= MAX_ROTATION {
        return Err(AppError::ValidationError(
            "Rotation must be within 0-360 degrees".to_string(),
        ));
    }
    Ok(())
}

fn validate_position(position_x: f64, position_y: f64) -> Result<(), AppError> {
    if !position_x.is_finite() || !position_y.is_finite() {
        return Err(AppError::ValidationError(
            "Element position must be finite numbers".to_string(),
        ));
    }
    Ok(())
}

fn validate_optional_coordinate(value: Option<f64>, label: &str) -> Result<(), AppError> {
    let Some(value) = value else {
        return Ok(());
    };
    if !value.is_finite() {
        return Err(AppError::ValidationError(format!(
            "Element {} must be a finite number",
            label
        )));
    }
    Ok(())
}

fn validate_optional_dimension(value: Option<f64>, label: &str) -> Result<(), AppError> {
    let Some(value) = value else {
        return Ok(());
    };
    if !value.is_finite() {
        return Err(AppError::ValidationError(format!(
            "Element {} must be a finite number",
            label
        )));
    }
    if value <= 0.0 {
        return Err(AppError::ValidationError(format!(
            "Element {} must be positive",
            label
        )));
    }
    Ok(())
}

fn normalize_dimension(origin: f64, size: f64) -> (f64, f64) {
    if size < 0.0 {
        (origin + size, size.abs())
    } else {
        (origin, size)
    }
}

fn default_style() -> serde_json::Value {
    serde_json::json!({
        "fill": "#ffffff",
        "stroke": "#000000",
        "strokeWidth": 1,
        "opacity": 1,
        "cornerRadius": 0,
        "shadow": null
    })
}

fn default_properties() -> serde_json::Value {
    serde_json::json!({})
}

fn default_metadata() -> serde_json::Value {
    serde_json::json!({})
}

#[cfg(test)]
mod tests {
    use super::{validate_dimensions, validate_position, validate_rotation};

    #[test]
    fn validate_dimensions_rejects_non_positive() {
        assert!(validate_dimensions(0.0, 10.0).is_err());
        assert!(validate_dimensions(10.0, -1.0).is_err());
        assert!(validate_dimensions(10.0, 10.0).is_ok());
    }

    #[test]
    fn validate_rotation_accepts_range() {
        assert!(validate_rotation(Some(-1.0)).is_err());
        assert!(validate_rotation(Some(360.0)).is_err());
        assert!(validate_rotation(Some(90.0)).is_ok());
        assert!(validate_rotation(None).is_ok());
    }

    #[test]
    fn validate_position_rejects_non_finite() {
        assert!(validate_position(f64::NAN, 0.0).is_err());
        assert!(validate_position(0.0, f64::INFINITY).is_err());
        assert!(validate_position(1.0, 2.0).is_ok());
    }

    #[test]
    fn normalize_dimension_flips_negative_sizes() {
        let (position, size) = super::normalize_dimension(10.0, -5.0);
        assert_eq!(position, 5.0);
        assert_eq!(size, 5.0);
    }
}
