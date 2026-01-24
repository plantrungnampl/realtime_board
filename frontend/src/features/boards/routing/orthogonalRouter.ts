import type { Point } from "@/features/boards/boardRoute.utils";

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type RouteOptions = {
  padding?: number;
  margin?: number;
  bendPenalty?: number;
};

type RouteResult = {
  points: number[];
  bounds: Rect;
};

type Node = {
  x: number;
  y: number;
};

type Direction = "h" | "v" | null;

type StateKey = string;

type State = {
  key: StateKey;
  node: Node;
  dir: Direction;
};

const popLowestFScore = (
  open: State[],
  fScore: Map<StateKey, number>,
): State | null => {
  if (open.length === 0) return null;
  let bestIndex = 0;
  let bestScore = fScore.get(open[0].key) ?? Number.POSITIVE_INFINITY;
  for (let i = 1; i < open.length; i += 1) {
    const score = fScore.get(open[i].key) ?? Number.POSITIVE_INFINITY;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  // Perf: avoid per-iteration sort by scanning for the best state in O(n).
  const lastIndex = open.length - 1;
  const best = open[bestIndex];
  if (bestIndex !== lastIndex) {
    open[bestIndex] = open[lastIndex];
  }
  open.pop();
  return best;
};

const DEFAULT_PADDING = 12;
const DEFAULT_MARGIN = 320;
const DEFAULT_BEND_PENALTY = 20;
const EPS = 0.0001;

const buildBounds = (points: Node[]): Rect => {
  if (points.length === 0) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  let left = points[0].x;
  let right = points[0].x;
  let top = points[0].y;
  let bottom = points[0].y;
  points.forEach((point) => {
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  });
  return { left, right, top, bottom };
};

const isInsideRect = (point: Node, rect: Rect) =>
  point.x > rect.left + EPS
  && point.x < rect.right - EPS
  && point.y > rect.top + EPS
  && point.y < rect.bottom - EPS;

const segmentIntersectsRect = (
  start: Node,
  end: Node,
  rect: Rect,
): boolean => {
  if (start.x === end.x) {
    const x = start.x;
    if (x <= rect.left + EPS || x >= rect.right - EPS) return false;
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return maxY > rect.top + EPS && minY < rect.bottom - EPS;
  }
  if (start.y === end.y) {
    const y = start.y;
    if (y <= rect.top + EPS || y >= rect.bottom - EPS) return false;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return maxX > rect.left + EPS && minX < rect.right - EPS;
  }
  return false;
};

const addPadding = (rect: Rect, padding: number): Rect => ({
  left: rect.left - padding,
  right: rect.right + padding,
  top: rect.top - padding,
  bottom: rect.bottom + padding,
});

const clampRect = (rect: Rect, bounds: Rect): Rect => ({
  left: Math.max(rect.left, bounds.left),
  right: Math.min(rect.right, bounds.right),
  top: Math.max(rect.top, bounds.top),
  bottom: Math.min(rect.bottom, bounds.bottom),
});

const toKey = (node: Node) => `${node.x}:${node.y}`;

const compressPoints = (points: Node[]): Node[] => {
  if (points.length <= 2) return points;
  const result: Node[] = [points[0]];
  let prev = points[0];
  let prevDir: Direction = null;
  for (let i = 1; i < points.length; i += 1) {
    const current = points[i];
    const dir: Direction = current.x === prev.x ? "v" : "h";
    if (prevDir && dir !== prevDir) {
      result.push(prev);
    }
    prevDir = dir;
    prev = current;
  }
  result.push(points[points.length - 1]);
  return result;
};

const buildFallbackPath = (start: Node, end: Node): Node[] => {
  if (start.x === end.x || start.y === end.y) {
    return [start, end];
  }
  const midA: Node = { x: start.x, y: end.y };
  const midB: Node = { x: end.x, y: start.y };
  return Math.hypot(end.x - midA.x, end.y - midA.y)
    <= Math.hypot(end.x - midB.x, end.y - midB.y)
    ? [start, midA, end]
    : [start, midB, end];
};

const buildGraph = (
  start: Node,
  end: Node,
  obstacles: Rect[],
  margin: number,
) => {
  const bounds = buildBounds([start, end]);
  const searchBounds: Rect = {
    left: bounds.left - margin,
    right: bounds.right + margin,
    top: bounds.top - margin,
    bottom: bounds.bottom + margin,
  };

  const relevantObstacles = obstacles
    .map((rect) => clampRect(rect, searchBounds))
    .filter((rect) => rect.left < rect.right && rect.top < rect.bottom);

  const xs = new Set<number>([start.x, end.x]);
  const ys = new Set<number>([start.y, end.y]);

  relevantObstacles.forEach((rect) => {
    xs.add(rect.left);
    xs.add(rect.right);
    ys.add(rect.top);
    ys.add(rect.bottom);
  });

  const xList = Array.from(xs).sort((a, b) => a - b);
  const yList = Array.from(ys).sort((a, b) => a - b);

  const nodes = new Map<string, Node>();
  xList.forEach((x) => {
    yList.forEach((y) => {
      const node = { x, y };
      if (node.x < searchBounds.left || node.x > searchBounds.right) return;
      if (node.y < searchBounds.top || node.y > searchBounds.bottom) return;
      if (relevantObstacles.some((rect) => isInsideRect(node, rect))) return;
      nodes.set(toKey(node), node);
    });
  });

  const edges = new Map<string, Node[]>();
  const addEdge = (from: Node, to: Node) => {
    const key = toKey(from);
    const list = edges.get(key) ?? [];
    list.push(to);
    edges.set(key, list);
  };

  for (let yi = 0; yi < yList.length; yi += 1) {
    const y = yList[yi];
    for (let xi = 0; xi < xList.length - 1; xi += 1) {
      const x1 = xList[xi];
      const x2 = xList[xi + 1];
      const n1 = nodes.get(`${x1}:${y}`);
      const n2 = nodes.get(`${x2}:${y}`);
      if (!n1 || !n2) continue;
      const segmentStart = n1;
      const segmentEnd = n2;
      const blocked = relevantObstacles.some((rect) =>
        segmentIntersectsRect(segmentStart, segmentEnd, rect),
      );
      if (!blocked) {
        addEdge(n1, n2);
        addEdge(n2, n1);
      }
    }
  }

  for (let xi = 0; xi < xList.length; xi += 1) {
    const x = xList[xi];
    for (let yi = 0; yi < yList.length - 1; yi += 1) {
      const y1 = yList[yi];
      const y2 = yList[yi + 1];
      const n1 = nodes.get(`${x}:${y1}`);
      const n2 = nodes.get(`${x}:${y2}`);
      if (!n1 || !n2) continue;
      const segmentStart = n1;
      const segmentEnd = n2;
      const blocked = relevantObstacles.some((rect) =>
        segmentIntersectsRect(segmentStart, segmentEnd, rect),
      );
      if (!blocked) {
        addEdge(n1, n2);
        addEdge(n2, n1);
      }
    }
  }

  return { nodes, edges, searchBounds };
};

const heuristic = (a: Node, b: Node) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const stateKey = (node: Node, dir: Direction) => `${toKey(node)}|${dir ?? "none"}`;

const reconstructPath = (cameFrom: Map<StateKey, StateKey>, current: StateKey, nodeMap: Map<StateKey, Node>) => {
  const nodes: Node[] = [];
  let cursor: StateKey | undefined = current;
  while (cursor) {
    const node = nodeMap.get(cursor);
    if (node) nodes.push(node);
    cursor = cameFrom.get(cursor);
  }
  nodes.reverse();
  return nodes;
};

export const routeOrthogonalPath = (
  start: Point,
  end: Point,
  obstacles: Rect[],
  options?: RouteOptions,
): RouteResult => {
  if (start.x === end.x && start.y === end.y) {
    const bounds = {
      left: start.x,
      right: end.x,
      top: start.y,
      bottom: end.y,
    };
    return { points: [start.x, start.y, end.x, end.y], bounds };
  }
  const padding = options?.padding ?? DEFAULT_PADDING;
  const margin = options?.margin ?? DEFAULT_MARGIN;
  const bendPenalty = options?.bendPenalty ?? DEFAULT_BEND_PENALTY;

  const paddedObstacles = obstacles.map((rect) => addPadding(rect, padding));
  const startNode: Node = { x: start.x, y: start.y };
  const endNode: Node = { x: end.x, y: end.y };

  const { nodes, edges } = buildGraph(startNode, endNode, paddedObstacles, margin);
  const startKey = toKey(startNode);
  const endKey = toKey(endNode);

  if (!nodes.has(startKey) || !nodes.has(endKey)) {
    const fallback = buildFallbackPath(startNode, endNode);
    const bounds = buildBounds(fallback);
    return { points: fallback.flatMap((point) => [point.x, point.y]), bounds };
  }

  const open: State[] = [];
  const openKeys = new Set<StateKey>();
  const gScore = new Map<StateKey, number>();
  const fScore = new Map<StateKey, number>();
  const cameFrom = new Map<StateKey, StateKey>();
  const nodeMap = new Map<StateKey, Node>();

  const startStateKey = stateKey(startNode, null);
  gScore.set(startStateKey, 0);
  fScore.set(startStateKey, heuristic(startNode, endNode));
  open.push({ key: startStateKey, node: startNode, dir: null });
  openKeys.add(startStateKey);
  nodeMap.set(startStateKey, startNode);

  const visited = new Set<StateKey>();

  while (open.length > 0) {
    const current = popLowestFScore(open, fScore);
    if (!current) break;
    openKeys.delete(current.key);
    if (current.node.x === endNode.x && current.node.y === endNode.y) {
      const path = reconstructPath(cameFrom, current.key, nodeMap);
      const compressed = compressPoints(path);
      const bounds = buildBounds(compressed);
      return {
        points: compressed.flatMap((point) => [point.x, point.y]),
        bounds,
      };
    }
    visited.add(current.key);

    const neighbors = edges.get(toKey(current.node)) ?? [];
    neighbors.forEach((neighbor) => {
      const dir: Direction = neighbor.x === current.node.x ? "v" : "h";
      const nextKey = stateKey(neighbor, dir);
      if (visited.has(nextKey)) return;

      const currentScore = gScore.get(current.key) ?? Number.POSITIVE_INFINITY;
      const penalty = current.dir && current.dir !== dir ? bendPenalty : 0;
      const tentativeG = currentScore + heuristic(current.node, neighbor) + penalty;
      const bestKnown = gScore.get(nextKey);
      if (bestKnown === undefined || tentativeG < bestKnown) {
        cameFrom.set(nextKey, current.key);
        gScore.set(nextKey, tentativeG);
        fScore.set(nextKey, tentativeG + heuristic(neighbor, endNode));
        nodeMap.set(nextKey, neighbor);
        // Perf: track open membership to avoid O(n) scans per neighbor.
        if (!openKeys.has(nextKey)) {
          open.push({ key: nextKey, node: neighbor, dir });
          openKeys.add(nextKey);
        }
      }
    });
  }

  const fallback = buildFallbackPath(startNode, endNode);
  const bounds = buildBounds(fallback);
  return { points: fallback.flatMap((point) => [point.x, point.y]), bounds };
};
