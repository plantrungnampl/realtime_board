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
  maxNodes?: number;
  maxIterations?: number;
  maxTimeMs?: number;
};

export type RouteResult = {
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
const MAX_MARGIN_MULTIPLIER = 4;
const DEFAULT_MAX_NODES = 40_000;
const DEFAULT_MAX_ITERATIONS = 40_000;
const DEFAULT_MAX_TIME_MS = 12;
const EPS = 0.0001;

const shouldDebugRouting = () =>
  typeof window !== "undefined"
  && window.localStorage?.getItem("RTC_DEBUG_ROUTING") === "1";

type GraphCache = {
  nodes: Map<string, Node>;
  edges: Map<string, Node[]>;
  searchBounds: Rect;
  tooDense: boolean;
};

const GRAPH_CACHE_LIMIT = 6;
const graphCache = new Map<string, GraphCache>();
const obstacleHashCache = new WeakMap<Rect[], number>();

const hashNumber = (value: number) => Math.round(value * 1000);

const hashObstacles = (obstacles: Rect[]) => {
  if (obstacleHashCache.has(obstacles)) {
    return obstacleHashCache.get(obstacles) ?? 0;
  }
  let hash = 2166136261;
  const values: number[] = [];
  obstacles.forEach((rect) => {
    values.push(
      hashNumber(rect.left),
      hashNumber(rect.top),
      hashNumber(rect.right),
      hashNumber(rect.bottom),
    );
  });
  values.sort((a, b) => a - b);
  values.forEach((value) => {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  });
  const normalized = hash >>> 0;
  obstacleHashCache.set(obstacles, normalized);
  return normalized;
};

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
  maxNodes: number,
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
  for (let xi = 0; xi < xList.length; xi += 1) {
    const x = xList[xi];
    for (let yi = 0; yi < yList.length; yi += 1) {
      const y = yList[yi];
      const node = { x, y };
      if (node.x < searchBounds.left || node.x > searchBounds.right) continue;
      if (node.y < searchBounds.top || node.y > searchBounds.bottom) continue;
      if (relevantObstacles.some((rect) => isInsideRect(node, rect))) continue;
      nodes.set(toKey(node), node);
      if (nodes.size > maxNodes) {
        break;
      }
    }
    if (nodes.size > maxNodes) {
      break;
    }
  }
  if (nodes.size > maxNodes) {
    return {
      nodes: new Map<string, Node>(),
      edges: new Map<string, Node[]>(),
      searchBounds,
      tooDense: true,
    };
  }

  const edges = new Map<string, Node[]>();
  const addEdge = (from: Node, to: Node) => {
    const key = toKey(from);
    const list = edges.get(key) ?? [];
    list.push(to);
    edges.set(key, list);
  };

  const obstaclesByY = new Map<number, Rect[]>();
  const obstaclesByX = new Map<number, Rect[]>();
  const getRowObstacles = (y: number) => {
    let list = obstaclesByY.get(y);
    if (!list) {
      list = relevantObstacles.filter((rect) => y > rect.top + EPS && y < rect.bottom - EPS);
      obstaclesByY.set(y, list);
    }
    return list;
  };
  const getColObstacles = (x: number) => {
    let list = obstaclesByX.get(x);
    if (!list) {
      list = relevantObstacles.filter((rect) => x > rect.left + EPS && x < rect.right - EPS);
      obstaclesByX.set(x, list);
    }
    return list;
  };

  for (let yi = 0; yi < yList.length; yi += 1) {
    const y = yList[yi];
    const rowObstacles = getRowObstacles(y);
    for (let xi = 0; xi < xList.length - 1; xi += 1) {
      const x1 = xList[xi];
      const x2 = xList[xi + 1];
      const n1 = nodes.get(`${x1}:${y}`);
      const n2 = nodes.get(`${x2}:${y}`);
      if (!n1 || !n2) continue;
      const segmentStart = n1;
      const segmentEnd = n2;
      const blocked = rowObstacles.some((rect) =>
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
    const colObstacles = getColObstacles(x);
    for (let yi = 0; yi < yList.length - 1; yi += 1) {
      const y1 = yList[yi];
      const y2 = yList[yi + 1];
      const n1 = nodes.get(`${x}:${y1}`);
      const n2 = nodes.get(`${x}:${y2}`);
      if (!n1 || !n2) continue;
      const segmentStart = n1;
      const segmentEnd = n2;
      const blocked = colObstacles.some((rect) =>
        segmentIntersectsRect(segmentStart, segmentEnd, rect),
      );
      if (!blocked) {
        addEdge(n1, n2);
        addEdge(n2, n1);
      }
    }
  }

  return { nodes, edges, searchBounds, tooDense: false };
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

const buildPointList = (nodes: Node[]) => nodes.flatMap((point) => [point.x, point.y]);

const pathIntersectsObstacles = (nodes: Node[], obstacles: Rect[]) => {
  if (nodes.length < 2) return false;
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const start = nodes[i];
    const end = nodes[i + 1];
    for (const rect of obstacles) {
      if (segmentIntersectsRect(start, end, rect) || isInsideRect(start, rect) || isInsideRect(end, rect)) {
        return true;
      }
    }
  }
  return false;
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
  const baseMargin = options?.margin ?? DEFAULT_MARGIN;
  const bendPenalty = options?.bendPenalty ?? DEFAULT_BEND_PENALTY;
  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_NODES;
  const maxIterations = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const maxTimeMs = options?.maxTimeMs ?? DEFAULT_MAX_TIME_MS;

  const paddingOptions = [padding, padding * 2];
  const startNode: Node = { x: start.x, y: start.y };
  const endNode: Node = { x: end.x, y: end.y };

  for (let paddingIndex = 0; paddingIndex < paddingOptions.length; paddingIndex += 1) {
    const pad = paddingOptions[paddingIndex];
    const paddedObstacles = obstacles.map((rect) => addPadding(rect, pad));
    const obstacleHash = hashObstacles(paddedObstacles);
    let lastPath: Node[] | null = null;
    let lastBounds: Rect | null = null;
    const maxMargin = baseMargin * MAX_MARGIN_MULTIPLIER;
    for (let margin = baseMargin; margin <= maxMargin; margin *= 2) {
      const cacheKey = `${start.x}:${start.y}:${end.x}:${end.y}:${margin}:${maxNodes}:${obstacleHash}`;
      const cached = graphCache.get(cacheKey);
      const graph = cached ?? buildGraph(
        startNode,
        endNode,
        paddedObstacles,
        margin,
        maxNodes,
      );
      if (!cached) {
        graphCache.set(cacheKey, graph);
        if (graphCache.size > GRAPH_CACHE_LIMIT) {
          const oldest = graphCache.keys().next().value;
          graphCache.delete(oldest);
        }
      }
      const { nodes, edges, tooDense } = graph;
      if (tooDense) {
        if (shouldDebugRouting()) {
          // eslint-disable-next-line no-console
          console.debug("[routing] graph too dense", {
            start,
            end,
            margin,
            obstacles: paddedObstacles.length,
            maxNodes,
          });
        }
        continue;
      }
      const startKey = toKey(startNode);
      const endKey = toKey(endNode);

      if (!nodes.has(startKey) || !nodes.has(endKey)) {
        continue;
      }

      const open: State[] = [];
      const gScore = new Map<StateKey, number>();
      const fScore = new Map<StateKey, number>();
      const cameFrom = new Map<StateKey, StateKey>();
      const nodeMap = new Map<StateKey, Node>();

      const startStateKey = stateKey(startNode, null);
      gScore.set(startStateKey, 0);
      fScore.set(startStateKey, heuristic(startNode, endNode));
      open.push({ key: startStateKey, node: startNode, dir: null });
      nodeMap.set(startStateKey, startNode);

      const visited = new Set<StateKey>();

      let foundPath: Node[] | null = null;
      const startedAt = performance.now();
      let iterations = 0;
      while (open.length > 0) {
        iterations += 1;
        if (iterations > maxIterations) {
          if (shouldDebugRouting()) {
            // eslint-disable-next-line no-console
            console.debug("[routing] iteration budget exceeded", {
              start,
              end,
              margin,
              iterations,
              maxIterations,
            });
          }
          break;
        }
        if ((iterations & 63) === 0 && performance.now() - startedAt > maxTimeMs) {
          if (shouldDebugRouting()) {
            // eslint-disable-next-line no-console
            console.debug("[routing] time budget exceeded", {
              start,
              end,
              margin,
              elapsed: performance.now() - startedAt,
              maxTimeMs,
            });
          }
          break;
        }
        const current = popLowestFScore(open, fScore);
        if (!current) break;
        if (current.node.x === endNode.x && current.node.y === endNode.y) {
          const path = reconstructPath(cameFrom, current.key, nodeMap);
          foundPath = compressPoints(path);
          break;
        }
        if (visited.has(current.key)) continue;
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
            open.push({ key: nextKey, node: neighbor, dir });
          }
        });
      }

      if (foundPath) {
        lastPath = foundPath;
        lastBounds = buildBounds(foundPath);
        if (!pathIntersectsObstacles(foundPath, paddedObstacles)) {
          return {
            points: buildPointList(foundPath),
            bounds: lastBounds,
          };
        }
      }
    }

    if (lastPath && lastBounds && paddingIndex === paddingOptions.length - 1) {
      return { points: buildPointList(lastPath), bounds: lastBounds };
    }
  }

  const fallback = buildFallbackPath(startNode, endNode);
  const bounds = buildBounds(fallback);
  return { points: buildPointList(fallback), bounds };
};
