import * as Y from "yjs";

import type { BoardElement, ElementStyle } from "@/features/boards/types";

type ElementPatch = Partial<BoardElement> & {
  deleted_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type RecordValue = Record<string, unknown>;

type ElementMap = Y.Map<unknown>;

type ElementsMap = Y.Map<ElementMap>;

const TEXT_KEYS = new Set(["content", "title", "name"]);

const ELEMENT_TYPES = new Set<BoardElement["element_type"]>([
  "Shape",
  "Text",
  "StickyNote",
  "Image",
  "Video",
  "Frame",
  "Connector",
  "Drawing",
  "Embed",
  "Document",
  "Component",
]);

const ELEMENT_TYPE_MAP: Record<string, BoardElement["element_type"]> = {
  shape: "Shape",
  text: "Text",
  sticky_note: "StickyNote",
  sticky: "StickyNote",
  image: "Image",
  video: "Video",
  frame: "Frame",
  connector: "Connector",
  drawing: "Drawing",
  embed: "Embed",
  document: "Document",
  component: "Component",
};

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown) =>
  typeof value === "string" ? value : null;

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asRecord = (value: unknown): RecordValue | null =>
  isRecord(value) ? value : null;

const ensureMap = (map: ElementMap, key: string) => {
  const existing = map.get(key);
  if (existing instanceof Y.Map) return existing as ElementMap;
  const nested = new Y.Map();
  map.set(key, nested);
  return nested as ElementMap;
};

const setScalar = (map: ElementMap, key: string, value: unknown) => {
  if (value === undefined) return;
  if (value === null) {
    map.delete(key);
    return;
  }
  map.set(key, value);
};

const setText = (map: ElementMap, key: string, value: string) => {
  const existing = map.get(key);
  const text = existing instanceof Y.Text ? existing : new Y.Text();
  if (!(existing instanceof Y.Text)) {
    map.set(key, text);
  }
  if (text.length > 0) {
    text.delete(0, text.length);
  }
  if (value.length > 0) {
    text.insert(0, value);
  }
};

const setArray = (map: ElementMap, key: string, value: unknown[]) => {
  const existing = map.get(key);
  const array = existing instanceof Y.Array ? existing : new Y.Array();
  if (!(existing instanceof Y.Array)) {
    map.set(key, array);
  }
  if (array.length > 0) {
    array.delete(0, array.length);
  }
  array.push(value);
};

const applyValue = (map: ElementMap, key: string, value: unknown) => {
  if (value === undefined) return;
  if (value === null) {
    map.delete(key);
    return;
  }
  if (TEXT_KEYS.has(key) && typeof value === "string") {
    setText(map, key, value);
    return;
  }
  if (Array.isArray(value)) {
    setArray(map, key, value);
    return;
  }
  if (isRecord(value)) {
    const nested = ensureMap(map, key);
    applyObjectPatch(nested, value, applyValue);
    return;
  }
  map.set(key, value);
};

const applyObjectPatch = (
  map: ElementMap,
  value: unknown,
  apply: (map: ElementMap, key: string, value: unknown) => void,
) => {
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([field, fieldValue]) => {
    apply(map, field, fieldValue);
  });
};

const applyPropertiesPatch = (map: ElementMap, value: unknown) => {
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([field, fieldValue]) => {
    applyValue(map, field, fieldValue);
  });
};

const normalizeElementType = (
  value: string,
): BoardElement["element_type"] | null => {
  if (ELEMENT_TYPES.has(value as BoardElement["element_type"])) {
    return value as BoardElement["element_type"];
  }
  const normalized = value.toLowerCase();
  return ELEMENT_TYPE_MAP[normalized] ?? null;
};

export const getElementsMap = (doc: Y.Doc): ElementsMap =>
  doc.getMap<ElementMap>("elements");

export const createElementEntry = (
  elements: ElementsMap,
  id: string,
  element: BoardElement,
): ElementMap => {
  const map = new Y.Map();
  elements.set(id, map);
  applyElementPatch(map, { ...element, id });
  return map as ElementMap;
};

export const applyElementPatch = (map: ElementMap, patch: ElementPatch) => {
  setScalar(map, "id", patch.id);
  setScalar(map, "board_id", patch.board_id);
  setScalar(map, "element_type", patch.element_type);
  setScalar(map, "position_x", patch.position_x);
  setScalar(map, "position_y", patch.position_y);
  setScalar(map, "width", patch.width);
  setScalar(map, "height", patch.height);
  setScalar(map, "rotation", patch.rotation);
  setScalar(map, "z_index", patch.z_index);
  setScalar(map, "created_by", patch.created_by);
  setScalar(map, "created_at", patch.created_at);
  setScalar(map, "updated_at", patch.updated_at);
  setScalar(map, "version", patch.version);
  setScalar(map, "deleted_at", patch.deleted_at);

  if (patch.style && isRecord(patch.style)) {
    const styleMap = ensureMap(map, "style");
    applyObjectPatch(styleMap, patch.style, applyValue);
  }

  if (patch.properties && isRecord(patch.properties)) {
    const propMap = ensureMap(map, "properties");
    applyPropertiesPatch(propMap, patch.properties);
  }

  if (patch.metadata && isRecord(patch.metadata)) {
    const metaMap = ensureMap(map, "metadata");
    applyObjectPatch(metaMap, patch.metadata, applyValue);
  }
};

export const materializeElement = (
  map: ElementMap,
  options?: { includeDeleted?: boolean },
): BoardElement | null => {
  const data = map.toJSON() as RecordValue;
  const deletedAt = asString(data.deleted_at);
  if (deletedAt && !options?.includeDeleted) return null;

  const id = asString(data.id);
  const boardId = asString(data.board_id);
  const elementTypeRaw = asString(data.element_type);
  const positionX = asNumber(data.position_x);
  const positionY = asNumber(data.position_y);
  const width = asNumber(data.width);
  const height = asNumber(data.height);

  if (
    !id
    || !boardId
    || !elementTypeRaw
    || positionX === null
    || positionY === null
    || width === null
    || height === null
  ) {
    return null;
  }

  const elementType = normalizeElementType(elementTypeRaw);
  if (!elementType) return null;

  const rotation = asNumber(data.rotation) ?? 0;
  const zIndex = asNumber(data.z_index) ?? 0;
  const createdBy = asString(data.created_by) ?? undefined;
  const createdAt = asString(data.created_at) ?? undefined;
  const updatedAt = asString(data.updated_at) ?? undefined;
  const version = asNumber(data.version) ?? undefined;

  const style = asRecord(data.style) ?? {};
  const properties = asRecord(data.properties) ?? {};

  return {
    id,
    board_id: boardId,
    element_type: elementType,
    position_x: positionX,
    position_y: positionY,
    width,
    height,
    rotation,
    z_index: zIndex,
    style: style as ElementStyle,
    properties,
    created_by: createdBy,
    created_at: createdAt,
    updated_at: updatedAt,
    version,
  } as BoardElement;
};

export const materializeElements = (elements: ElementsMap): BoardElement[] => {
  const list: BoardElement[] = [];
  elements.forEach((value) => {
    if (!(value instanceof Y.Map)) return;
    const element = materializeElement(value as ElementMap);
    if (element) list.push(element);
  });
  return list;
};

export const materializeLegacyElement = (
  value: RecordValue,
): BoardElement | null => {
  const deletedAt = asString(value.deleted_at);
  if (deletedAt) return null;
  const id = asString(value.id);
  const boardId = asString(value.board_id);
  const elementTypeRaw = asString(value.element_type);
  const positionX = asNumber(value.position_x);
  const positionY = asNumber(value.position_y);
  const width = asNumber(value.width);
  const height = asNumber(value.height);

  if (
    !id
    || !boardId
    || !elementTypeRaw
    || positionX === null
    || positionY === null
    || width === null
    || height === null
  ) {
    return null;
  }

  const elementType = normalizeElementType(elementTypeRaw);
  if (!elementType) return null;

  const rotation = asNumber(value.rotation) ?? 0;
  const zIndex = asNumber(value.z_index) ?? 0;
  const createdBy = asString(value.created_by) ?? undefined;
  const createdAt = asString(value.created_at) ?? undefined;
  const updatedAt = asString(value.updated_at) ?? undefined;
  const version = asNumber(value.version) ?? undefined;

  const style = asRecord(value.style) ?? {};
  const properties = asRecord(value.properties) ?? {};

  return {
    id,
    board_id: boardId,
    element_type: elementType,
    position_x: positionX,
    position_y: positionY,
    width,
    height,
    rotation,
    z_index: zIndex,
    style: style as ElementStyle,
    properties,
    created_by: createdBy,
    created_at: createdAt,
    updated_at: updatedAt,
    version,
  } as BoardElement;
};

const serializeValue = (value: unknown) => {
  if (value === undefined) return "__undefined__";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const diffRecord = (current: RecordValue, next: RecordValue) => {
  const patch: RecordValue = {};
  const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
  keys.forEach((key) => {
    const left = current[key];
    const right = next[key];
    if (serializeValue(left) !== serializeValue(right)) {
      patch[key] = right === undefined ? null : right;
    }
  });
  return Object.keys(patch).length > 0 ? patch : null;
};

export const diffElementPatch = (
  current: BoardElement,
  next: BoardElement,
): ElementPatch | null => {
  const patch: ElementPatch = {};

  if (current.position_x !== next.position_x) {
    patch.position_x = next.position_x;
  }
  if (current.position_y !== next.position_y) {
    patch.position_y = next.position_y;
  }
  if (current.width !== next.width) {
    patch.width = next.width;
  }
  if (current.height !== next.height) {
    patch.height = next.height;
  }
  if ((current.rotation ?? 0) !== (next.rotation ?? 0)) {
    patch.rotation = next.rotation ?? 0;
  }
  if ((current.z_index ?? 0) !== (next.z_index ?? 0)) {
    patch.z_index = next.z_index ?? 0;
  }
  if (current.element_type !== next.element_type) {
    patch.element_type = next.element_type;
  }

  const stylePatch = diffRecord(
    asRecord(current.style) ?? {},
    asRecord(next.style) ?? {},
  );
  if (stylePatch) {
    patch.style = stylePatch as ElementStyle;
  }

  const propPatch = diffRecord(
    (current.properties ?? {}) as RecordValue,
    (next.properties ?? {}) as RecordValue,
  );
  if (propPatch) {
    patch.properties = propPatch;
  }

  if (Object.keys(patch).length === 0) return null;
  return patch;
};

export const isCompleteElement = (patch: ElementPatch): patch is BoardElement =>
  typeof patch.id === "string" &&
  typeof patch.board_id === "string" &&
  typeof patch.element_type === "string" &&
  typeof patch.position_x === "number" &&
  typeof patch.position_y === "number" &&
  typeof patch.width === "number" &&
  typeof patch.height === "number";
