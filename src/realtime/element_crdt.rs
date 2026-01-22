use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;
use yrs::{
    Any, Array, ArrayRef, Doc, Map, MapRef, Out, ReadTxn, Text, TextRef, Transact,
    TransactionMut, WriteTxn,
};
use yrs::encoding::serde::{from_any, to_any};
use yrs::types::ToJson;

use crate::{
    dto::elements::UpdateBoardElementRequest,
    error::AppError,
    models::elements::ElementType,
};

const ELEMENTS_MAP: &str = "elements";
const FIELD_ID: &str = "id";
const FIELD_BOARD_ID: &str = "board_id";
const FIELD_LAYER_ID: &str = "layer_id";
const FIELD_PARENT_ID: &str = "parent_id";
const FIELD_CREATED_BY: &str = "created_by";
const FIELD_CREATED_AT: &str = "created_at";
const FIELD_UPDATED_AT: &str = "updated_at";
const FIELD_ELEMENT_TYPE: &str = "element_type";
const FIELD_POSITION_X: &str = "position_x";
const FIELD_POSITION_Y: &str = "position_y";
const FIELD_WIDTH: &str = "width";
const FIELD_HEIGHT: &str = "height";
const FIELD_ROTATION: &str = "rotation";
const FIELD_Z_INDEX: &str = "z_index";
const FIELD_STYLE: &str = "style";
const FIELD_PROPERTIES: &str = "properties";
const FIELD_METADATA: &str = "metadata";
const FIELD_DELETED_AT: &str = "deleted_at";
const FIELD_VERSION: &str = "version";
const TEXT_KEYS: [&str; 3] = ["content", "title", "name"];

#[derive(Debug, Clone)]
pub struct ElementSnapshot {
    pub id: Uuid,
    pub board_id: Uuid,
    pub layer_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub created_by: Uuid,
    pub element_type: ElementType,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub z_index: i32,
    pub style: Value,
    pub properties: Value,
    pub metadata: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub version: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementMaterialized {
    pub id: Uuid,
    pub board_id: Uuid,
    pub layer_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub created_by: Option<Uuid>,
    pub element_type: ElementType,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub z_index: i32,
    pub style: Value,
    pub properties: Value,
    pub metadata: Value,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub version: Option<i32>,
}

#[derive(Debug)]
pub struct AppliedElement {
    pub element: ElementMaterialized,
    pub update: Vec<u8>,
}

pub fn apply_snapshot(doc: &Doc, snapshot: &ElementSnapshot) -> Result<AppliedElement, AppError> {
    let mut txn = doc.transact_mut();
    let elements = txn.get_or_insert_map(ELEMENTS_MAP);
    let element_id = snapshot.id.to_string();
    let map = elements.get_or_init(&mut txn, element_id.clone());

    set_uuid(&mut txn, &map, FIELD_ID, snapshot.id);
    set_uuid(&mut txn, &map, FIELD_BOARD_ID, snapshot.board_id);
    set_uuid_opt(&mut txn, &map, FIELD_LAYER_ID, snapshot.layer_id);
    set_uuid_opt(&mut txn, &map, FIELD_PARENT_ID, snapshot.parent_id);
    set_uuid(&mut txn, &map, FIELD_CREATED_BY, snapshot.created_by);
    set_datetime(&mut txn, &map, FIELD_CREATED_AT, snapshot.created_at);
    set_datetime(&mut txn, &map, FIELD_UPDATED_AT, snapshot.updated_at);
    set_string(
        &mut txn,
        &map,
        FIELD_ELEMENT_TYPE,
        element_type_to_client(snapshot.element_type),
    );
    set_number(&mut txn, &map, FIELD_POSITION_X, snapshot.position_x);
    set_number(&mut txn, &map, FIELD_POSITION_Y, snapshot.position_y);
    set_number(&mut txn, &map, FIELD_WIDTH, snapshot.width);
    set_number(&mut txn, &map, FIELD_HEIGHT, snapshot.height);
    set_number(&mut txn, &map, FIELD_ROTATION, snapshot.rotation);
    set_number(&mut txn, &map, FIELD_Z_INDEX, snapshot.z_index as f64);
    apply_object_patch(&mut txn, &map, FIELD_STYLE, &snapshot.style);
    apply_properties_patch(&mut txn, &map, FIELD_PROPERTIES, &snapshot.properties);
    apply_object_patch(&mut txn, &map, FIELD_METADATA, &snapshot.metadata);
    set_datetime_opt(&mut txn, &map, FIELD_DELETED_AT, snapshot.deleted_at);
    set_number(&mut txn, &map, FIELD_VERSION, snapshot.version as f64);

    let update = txn.encode_update_v1();
    let element = materialize_from_map(&txn, &map, &element_id)
        .ok_or_else(|| AppError::Internal("Failed to materialize element".to_string()))?;
    Ok(AppliedElement { element, update })
}

pub fn apply_missing_fields(
    doc: &Doc,
    snapshot: &ElementSnapshot,
) -> Result<Option<AppliedElement>, AppError> {
    let mut txn = doc.transact_mut();
    let elements = txn.get_or_insert_map(ELEMENTS_MAP);
    let element_id = snapshot.id.to_string();
    let map = elements.get_or_init(&mut txn, element_id.clone());
    let mut changed = false;

    changed |= set_if_missing_uuid(&mut txn, &map, FIELD_ID, snapshot.id);
    changed |= set_if_missing_uuid(&mut txn, &map, FIELD_BOARD_ID, snapshot.board_id);
    changed |= set_if_missing_uuid_opt(&mut txn, &map, FIELD_LAYER_ID, snapshot.layer_id);
    changed |= set_if_missing_uuid_opt(&mut txn, &map, FIELD_PARENT_ID, snapshot.parent_id);
    changed |= set_if_missing_uuid(&mut txn, &map, FIELD_CREATED_BY, snapshot.created_by);
    changed |= set_if_missing_datetime(&mut txn, &map, FIELD_CREATED_AT, snapshot.created_at);
    changed |= set_if_missing_datetime(&mut txn, &map, FIELD_UPDATED_AT, snapshot.updated_at);
    changed |= set_if_missing_string(
        &mut txn,
        &map,
        FIELD_ELEMENT_TYPE,
        element_type_to_client(snapshot.element_type),
    );
    changed |= set_if_missing_number(&mut txn, &map, FIELD_POSITION_X, snapshot.position_x);
    changed |= set_if_missing_number(&mut txn, &map, FIELD_POSITION_Y, snapshot.position_y);
    changed |= set_if_missing_number(&mut txn, &map, FIELD_WIDTH, snapshot.width);
    changed |= set_if_missing_number(&mut txn, &map, FIELD_HEIGHT, snapshot.height);
    changed |= set_if_missing_number(&mut txn, &map, FIELD_ROTATION, snapshot.rotation);
    changed |= set_if_missing_number(&mut txn, &map, FIELD_Z_INDEX, snapshot.z_index as f64);
    changed |= set_if_missing_object(&mut txn, &map, FIELD_STYLE, &snapshot.style);
    changed |= set_if_missing_properties(&mut txn, &map, FIELD_PROPERTIES, &snapshot.properties);
    changed |= set_if_missing_object(&mut txn, &map, FIELD_METADATA, &snapshot.metadata);
    changed |= set_if_missing_datetime_opt(&mut txn, &map, FIELD_DELETED_AT, snapshot.deleted_at);
    changed |= set_if_missing_number(&mut txn, &map, FIELD_VERSION, snapshot.version as f64);

    if !changed {
        return Ok(None);
    }

    let update = txn.encode_update_v1();
    let element = materialize_from_map(&txn, &map, &element_id)
        .ok_or_else(|| AppError::Internal("Failed to materialize element".to_string()))?;
    Ok(Some(AppliedElement { element, update }))
}

pub fn apply_update(
    doc: &Doc,
    element_id: Uuid,
    req: &UpdateBoardElementRequest,
    updated_at: DateTime<Utc>,
) -> Result<Option<AppliedElement>, AppError> {
    let mut txn = doc.transact_mut();
    let elements = txn.get_or_insert_map(ELEMENTS_MAP);
    let key = element_id.to_string();
    let Some(map) = get_existing_element_map(&mut txn, &elements, &key) else {
        return Ok(None);
    };
    if map.get(&txn, FIELD_DELETED_AT).is_some() {
        return Ok(None);
    }

    if let Some(value) = req.position_x {
        set_number(&mut txn, &map, FIELD_POSITION_X, value);
    }
    if let Some(value) = req.position_y {
        set_number(&mut txn, &map, FIELD_POSITION_Y, value);
    }
    if let Some(value) = req.width {
        set_number(&mut txn, &map, FIELD_WIDTH, value);
    }
    if let Some(value) = req.height {
        set_number(&mut txn, &map, FIELD_HEIGHT, value);
    }
    if let Some(value) = req.rotation {
        set_number(&mut txn, &map, FIELD_ROTATION, value);
    }
    if let Some(style) = req.style.as_ref() {
        apply_object_patch(&mut txn, &map, FIELD_STYLE, style);
    }
    if let Some(properties) = req.properties.as_ref() {
        apply_properties_patch(&mut txn, &map, FIELD_PROPERTIES, properties);
    }
    if let Some(metadata) = req.metadata.as_ref() {
        apply_object_patch(&mut txn, &map, FIELD_METADATA, metadata);
    }

    bump_version(&mut txn, &map);
    set_datetime(&mut txn, &map, FIELD_UPDATED_AT, updated_at);

    let update = txn.encode_update_v1();
    let element = materialize_from_map(&txn, &map, &key)
        .ok_or_else(|| AppError::Internal("Failed to materialize element".to_string()))?;
    Ok(Some(AppliedElement { element, update }))
}

pub fn apply_deleted(
    doc: &Doc,
    element_id: Uuid,
    deleted_at: Option<DateTime<Utc>>,
    updated_at: DateTime<Utc>,
) -> Result<Option<AppliedElement>, AppError> {
    let mut txn = doc.transact_mut();
    let elements = txn.get_or_insert_map(ELEMENTS_MAP);
    let key = element_id.to_string();
    let Some(map) = get_existing_element_map(&mut txn, &elements, &key) else {
        return Ok(None);
    };

    set_datetime_opt(&mut txn, &map, FIELD_DELETED_AT, deleted_at);
    bump_version(&mut txn, &map);
    set_datetime(&mut txn, &map, FIELD_UPDATED_AT, updated_at);

    let update = txn.encode_update_v1();
    let element = materialize_from_map(&txn, &map, &key)
        .ok_or_else(|| AppError::Internal("Failed to materialize element".to_string()))?;
    Ok(Some(AppliedElement { element, update }))
}

pub fn materialize_elements(doc: &Doc) -> Vec<ElementMaterialized> {
    let txn = doc.transact();
    let Some(map) = txn.get_map(ELEMENTS_MAP) else {
        return Vec::new();
    };
    let mut elements = Vec::new();
    for (key, value) in map.iter(&txn) {
        let key_string = key.to_string();
        if let Some(element) = materialize_from_out(&txn, &key_string, value) {
            elements.push(element);
        }
    }
    elements
}

pub fn max_z_index(doc: &Doc, layer_id: Option<Uuid>) -> i32 {
    let txn = doc.transact();
    let Some(map) = txn.get_map(ELEMENTS_MAP) else {
        return 0;
    };
    let mut max = 0;
    for (_key, value) in map.iter(&txn) {
        let Some(element) = materialize_from_out(&txn, "", value) else {
            continue;
        };
        if element.deleted_at.is_some() {
            continue;
        }
        if element.layer_id != layer_id {
            continue;
        }
        max = max.max(element.z_index);
    }
    max
}

pub fn materialize_element(doc: &Doc, element_id: Uuid) -> Option<ElementMaterialized> {
    let txn = doc.transact();
    let map = txn.get_map(ELEMENTS_MAP)?;
    let element_key = element_id.to_string();
    let value = map.get(&txn, &element_key)?;
    materialize_from_out(&txn, &element_key, value)
}

fn get_existing_element_map(
    txn: &mut TransactionMut,
    elements: &MapRef,
    key: &str,
) -> Option<MapRef> {
    match elements.get(txn, key) {
        Some(Out::YMap(map)) => Some(map),
        Some(Out::Any(any)) => {
            let Ok(json) = from_any::<Value>(&any) else {
                return None;
            };
            let map: MapRef = elements.get_or_init(txn, key);
            apply_object_patch(txn, &map, "", &json);
            if let Some(properties) = json.get(FIELD_PROPERTIES) {
                apply_properties_patch(txn, &map, FIELD_PROPERTIES, properties);
            }
            Some(map)
        }
        _ => None,
    }
}

fn materialize_from_out<T: ReadTxn>(
    txn: &T,
    element_id: &str,
    value: Out,
) -> Option<ElementMaterialized> {
    match value {
        Out::YMap(map) => materialize_from_map(txn, &map, element_id),
        Out::Any(any) => materialize_from_any(any),
        _ => None,
    }
}

fn materialize_from_any(any: Any) -> Option<ElementMaterialized> {
    let Ok(json) = from_any::<Value>(&any) else {
        return None;
    };
    materialize_from_json(&json)
}

fn materialize_from_map<T: ReadTxn>(
    txn: &T,
    map: &MapRef,
    element_id: &str,
) -> Option<ElementMaterialized> {
    let any = map.to_json(txn);
    let Ok(json) = from_any::<Value>(&any) else {
        return None;
    };
    let mut element = materialize_from_json(&json)?;
    if element.id == Uuid::nil() && !element_id.is_empty() {
        if let Ok(parsed) = Uuid::parse_str(element_id) {
            element.id = parsed;
        }
    }
    Some(element)
}

fn materialize_from_json(json: &Value) -> Option<ElementMaterialized> {
    let object = json.as_object()?;
    let id = parse_uuid(object.get(FIELD_ID))?;
    let board_id = parse_uuid(object.get(FIELD_BOARD_ID))?;
    let element_type = parse_element_type(object.get(FIELD_ELEMENT_TYPE))?;
    let position_x = parse_number(object.get(FIELD_POSITION_X))?;
    let position_y = parse_number(object.get(FIELD_POSITION_Y))?;
    let width = parse_number(object.get(FIELD_WIDTH))?;
    let height = parse_number(object.get(FIELD_HEIGHT))?;
    let rotation = parse_number(object.get(FIELD_ROTATION)).unwrap_or(0.0);
    let z_index = parse_number(object.get(FIELD_Z_INDEX)).unwrap_or(0.0) as i32;
    let style = object.get(FIELD_STYLE).cloned().unwrap_or(Value::Object(Default::default()));
    let properties =
        object.get(FIELD_PROPERTIES).cloned().unwrap_or(Value::Object(Default::default()));
    let metadata =
        object.get(FIELD_METADATA).cloned().unwrap_or(Value::Object(Default::default()));

    Some(ElementMaterialized {
        id,
        board_id,
        layer_id: parse_uuid_optional(object.get(FIELD_LAYER_ID)),
        parent_id: parse_uuid_optional(object.get(FIELD_PARENT_ID)),
        created_by: parse_uuid_optional(object.get(FIELD_CREATED_BY)),
        element_type,
        position_x,
        position_y,
        width,
        height,
        rotation,
        z_index,
        style,
        properties,
        metadata,
        created_at: parse_datetime_optional(object.get(FIELD_CREATED_AT)),
        updated_at: parse_datetime_optional(object.get(FIELD_UPDATED_AT)),
        deleted_at: parse_datetime_optional(object.get(FIELD_DELETED_AT)),
        version: parse_number(object.get(FIELD_VERSION)).map(|v| v as i32),
    })
}

fn apply_object_patch(txn: &mut TransactionMut, map: &MapRef, key: &str, value: &Value) {
    if key.is_empty() {
        if let Some(object) = value.as_object() {
            for (field, field_value) in object {
                apply_value(txn, map, field, field_value);
            }
        }
        return;
    }

    let nested: MapRef = map.get_or_init(txn, key);
    if let Some(object) = value.as_object() {
        for (field, field_value) in object {
            apply_value(txn, &nested, field, field_value);
        }
    } else {
        apply_value(txn, map, key, value);
    }
}

fn apply_properties_patch(txn: &mut TransactionMut, map: &MapRef, key: &str, value: &Value) {
    if key.is_empty() {
        if let Some(object) = value.as_object() {
            for (field, field_value) in object {
                apply_property_value(txn, map, field, field_value);
            }
        }
        return;
    }
    let nested: MapRef = map.get_or_init(txn, key);
    if let Some(object) = value.as_object() {
        for (field, field_value) in object {
            apply_property_value(txn, &nested, field, field_value);
        }
    } else {
        apply_property_value(txn, map, key, value);
    }
}

fn apply_property_value(txn: &mut TransactionMut, map: &MapRef, key: &str, value: &Value) {
    if TEXT_KEYS.contains(&key) {
        apply_text_value(txn, map, key, value);
    } else {
        apply_value(txn, map, key, value);
    }
}

fn apply_value(txn: &mut TransactionMut, map: &MapRef, key: &str, value: &Value) {
    match value {
        Value::Null => {
            map.remove(txn, key);
        }
        Value::Bool(value) => {
            map.insert(txn, key.to_string(), *value);
        }
        Value::Number(value) => {
            if let Some(num) = value.as_f64() {
                map.insert(txn, key.to_string(), num);
            }
        }
        Value::String(value) => {
            map.insert(txn, key.to_string(), value.as_str());
        }
        Value::Array(items) => {
            let array: ArrayRef = map.get_or_init(txn, key);
            let len = array.len(txn);
            if len > 0 {
                array.remove_range(txn, 0, len);
            }
            for item in items {
                if let Ok(any) = to_any(item) {
                    array.push_back(txn, any);
                }
            }
        }
        Value::Object(_) => {
            let nested: MapRef = map.get_or_init(txn, key);
            apply_object_patch(txn, &nested, "", value);
        }
    }
}

fn apply_text_value(txn: &mut TransactionMut, map: &MapRef, key: &str, value: &Value) {
    if let Value::String(value) = value {
        let text: TextRef = map.get_or_init(txn, key);
        let current_len = text.len(txn);
        if current_len > 0 {
            text.remove_range(txn, 0, current_len);
        }
        text.insert(txn, 0, value);
    } else {
        apply_value(txn, map, key, value);
    }
}

fn bump_version(txn: &mut TransactionMut, map: &MapRef) {
    let next = match map.get(txn, FIELD_VERSION) {
        Some(Out::Any(Any::Number(value))) => value as i32 + 1,
        _ => 1,
    };
    map.insert(txn, FIELD_VERSION.to_string(), next as f64);
}

fn set_string(txn: &mut TransactionMut, map: &MapRef, key: &str, value: &str) {
    map.insert(txn, key.to_string(), value);
}

fn set_number(txn: &mut TransactionMut, map: &MapRef, key: &str, value: f64) {
    map.insert(txn, key.to_string(), value);
}

fn set_uuid(txn: &mut TransactionMut, map: &MapRef, key: &str, value: Uuid) {
    map.insert(txn, key.to_string(), value.to_string());
}

fn set_uuid_opt(
    txn: &mut TransactionMut,
    map: &MapRef,
    key: &str,
    value: Option<Uuid>,
) {
    if let Some(value) = value {
        set_uuid(txn, map, key, value);
    } else {
        map.remove(txn, key);
    }
}

fn set_datetime(txn: &mut TransactionMut, map: &MapRef, key: &str, value: DateTime<Utc>) {
    map.insert(txn, key.to_string(), value.to_rfc3339());
}

fn set_datetime_opt(
    txn: &mut TransactionMut,
    map: &MapRef,
    key: &str,
    value: Option<DateTime<Utc>>,
) {
    if let Some(value) = value {
        set_datetime(txn, map, key, value);
    } else {
        map.remove(txn, key);
    }
}

fn set_if_missing_uuid(
    txn: &mut TransactionMut,
    map: &MapRef,
    key: &str,
    value: Uuid,
) -> bool {
    if map.get(txn, key).is_some() {
        return false;
    }
    set_uuid(txn, map, key, value);
    true
}

fn set_if_missing_uuid_opt(
    txn: &mut TransactionMut,
    map: &MapRef,
    key: &str,
    value: Option<Uuid>,
) -> bool {
    if map.get(txn, key).is_some() {
        return false;
    }
    set_uuid_opt(txn, map, key, value);
    true
}

fn set_if_missing_datetime(
    txn: &mut TransactionMut,
    map: &MapRef,
    key: &str,
    value: DateTime<Utc>,
) -> bool {
    if map.get(txn, key).is_some() {
        return false;
    }
    set_datetime(txn, map, key, value);
    true
}

fn set_if_missing_datetime_opt(
    txn: &mut TransactionMut,
    map: &MapRef,
    key: &str,
    value: Option<DateTime<Utc>>,
) -> bool {
    if map.get(txn, key).is_some() {
        return false;
    }
    set_datetime_opt(txn, map, key, value);
    true
}

fn set_if_missing_string(
    txn: &mut TransactionMut,
    map: &MapRef,
    key: &str,
    value: &str,
) -> bool {
    if map.get(txn, key).is_some() {
        return false;
    }
    set_string(txn, map, key, value);
    true
}

fn set_if_missing_number(
    txn: &mut TransactionMut,
    map: &MapRef,
    key: &str,
    value: f64,
) -> bool {
    if map.get(txn, key).is_some() {
        return false;
    }
    set_number(txn, map, key, value);
    true
}

fn set_if_missing_object(
    txn: &mut TransactionMut,
    map: &MapRef,
    key: &str,
    value: &Value,
) -> bool {
    if map.get(txn, key).is_some() {
        return false;
    }
    apply_object_patch(txn, map, key, value);
    true
}

fn set_if_missing_properties(
    txn: &mut TransactionMut,
    map: &MapRef,
    key: &str,
    value: &Value,
) -> bool {
    if map.get(txn, key).is_some() {
        return false;
    }
    apply_properties_patch(txn, map, key, value);
    true
}

fn parse_uuid(value: Option<&Value>) -> Option<Uuid> {
    value
        .and_then(|value| value.as_str())
        .and_then(|value| Uuid::parse_str(value).ok())
}

fn parse_uuid_optional(value: Option<&Value>) -> Option<Uuid> {
    parse_uuid(value)
}

fn parse_number(value: Option<&Value>) -> Option<f64> {
    value.and_then(|value| value.as_f64())
}

fn parse_element_type(value: Option<&Value>) -> Option<ElementType> {
    value
        .and_then(|value| value.as_str())
        .and_then(|value| serde_json::from_value(Value::String(value.to_string())).ok())
}

fn parse_datetime_optional(value: Option<&Value>) -> Option<DateTime<Utc>> {
    value
        .and_then(|value| value.as_str())
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|dt| dt.with_timezone(&Utc))
}

fn element_type_to_client(element_type: ElementType) -> &'static str {
    match element_type {
        ElementType::Shape => "Shape",
        ElementType::Text => "Text",
        ElementType::StickyNote => "StickyNote",
        ElementType::Image => "Image",
        ElementType::Video => "Video",
        ElementType::Frame => "Frame",
        ElementType::Connector => "Connector",
        ElementType::Drawing => "Drawing",
        ElementType::Embed => "Embed",
        ElementType::Document => "Document",
        ElementType::Component => "Component",
    }
}
