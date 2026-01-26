import { routeOrthogonalPath } from "./orthogonalRouter";

type Point = {
  x: number;
  y: number;
};

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

type RouteRequest = {
  id: number;
  start: Point;
  end: Point;
  obstacles: Rect[];
  options?: RouteOptions;
};

type RouteResponse =
  | { id: number; result: { points: number[]; bounds: Rect } }
  | { id: number; error: string };

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<RouteRequest>) => {
  const { id, start, end, obstacles, options } = event.data;
  try {
    const result = routeOrthogonalPath(start, end, obstacles, options);
    const response: RouteResponse = { id, result };
    ctx.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown routing error";
    const response: RouteResponse = { id, error: message };
    ctx.postMessage(response);
  }
};
