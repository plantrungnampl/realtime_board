export type SpatialBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type SpatialEntry<T> = {
  bounds: SpatialBounds;
  value: T;
};

type SpatialIndexOptions = {
  capacity?: number;
  maxDepth?: number;
};

const EPS = 0.0001;

const intersects = (a: SpatialBounds, b: SpatialBounds) =>
  a.left <= b.right + EPS
  && a.right + EPS >= b.left
  && a.top <= b.bottom + EPS
  && a.bottom + EPS >= b.top;

const contains = (outer: SpatialBounds, inner: SpatialBounds) =>
  inner.left + EPS >= outer.left
  && inner.right - EPS <= outer.right
  && inner.top + EPS >= outer.top
  && inner.bottom - EPS <= outer.bottom;

export class SpatialIndex<T> {
  private bounds: SpatialBounds;
  private capacity: number;
  private maxDepth: number;
  private depth: number;
  private items: SpatialEntry<T>[] = [];
  private children: SpatialIndex<T>[] | null = null;

  constructor(bounds: SpatialBounds, options?: SpatialIndexOptions, depth = 0) {
    this.bounds = bounds;
    this.capacity = options?.capacity ?? 24;
    this.maxDepth = options?.maxDepth ?? 6;
    this.depth = depth;
  }

  insert(bounds: SpatialBounds, value: T) {
    if (!intersects(this.bounds, bounds)) return;
    if (this.children) {
      const inserted = this.insertIntoChildren(bounds, value);
      if (inserted) return;
    }
    this.items.push({ bounds, value });
    if (this.items.length > this.capacity && this.depth < this.maxDepth) {
      this.subdivide();
    }
  }

  query(range: SpatialBounds, out: T[] = []): T[] {
    if (!intersects(this.bounds, range)) return out;
    this.items.forEach((item) => {
      if (intersects(item.bounds, range)) {
        out.push(item.value);
      }
    });
    if (this.children) {
      this.children.forEach((child) => child.query(range, out));
    }
    return out;
  }

  private insertIntoChildren(bounds: SpatialBounds, value: T) {
    if (!this.children) return false;
    for (const child of this.children) {
      if (contains(child.bounds, bounds)) {
        child.insert(bounds, value);
        return true;
      }
    }
    return false;
  }

  private subdivide() {
    if (this.children) return;
    const { left, right, top, bottom } = this.bounds;
    const midX = (left + right) / 2;
    const midY = (top + bottom) / 2;
    this.children = [
      new SpatialIndex<T>(
        { left, right: midX, top, bottom: midY },
        { capacity: this.capacity, maxDepth: this.maxDepth },
        this.depth + 1,
      ),
      new SpatialIndex<T>(
        { left: midX, right, top, bottom: midY },
        { capacity: this.capacity, maxDepth: this.maxDepth },
        this.depth + 1,
      ),
      new SpatialIndex<T>(
        { left, right: midX, top: midY, bottom },
        { capacity: this.capacity, maxDepth: this.maxDepth },
        this.depth + 1,
      ),
      new SpatialIndex<T>(
        { left: midX, right, top: midY, bottom },
        { capacity: this.capacity, maxDepth: this.maxDepth },
        this.depth + 1,
      ),
    ];

    const items = this.items;
    this.items = [];
    items.forEach((item) => {
      if (!this.insertIntoChildren(item.bounds, item.value)) {
        this.items.push(item);
      }
    });
  }
}
