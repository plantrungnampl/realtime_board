import { useCallback, useEffect, useRef } from "react";

import type { RouteResult } from "@/features/boards/routing/orthogonalRouter";
import type { ConnectorRouteOptions } from "@/features/boards/boardCanvas/connectorRouting";
import type { Point } from "@/features/boards/boardRoute.utils";

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type RouteRequest = {
  start: Point;
  end: Point;
  obstacles: Rect[];
  options: ConnectorRouteOptions;
};

type RouteResponse =
  | { id: number; result: RouteResult }
  | { id: number; error: string };

export const useConnectorRoutingWorker = () => {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(
    new Map<number, { resolve: (result: RouteResult) => void; reject: (error: Error) => void }>(),
  );
  const seqRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(
      new URL("./connectorRouting.worker.ts", import.meta.url),
      { type: "module" },
    );
    const pending = pendingRef.current;
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<RouteResponse>) => {
      const message = event.data;
      const pendingRequest = pending.get(message.id);
      if (!pendingRequest) return;
      pending.delete(message.id);
      if ("error" in message) {
        pendingRequest.reject(new Error(message.error));
      } else {
        pendingRequest.resolve(message.result);
      }
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "Connector routing worker failed");
      pending.forEach(({ reject }) => reject(error));
      pending.clear();
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
      pending.forEach(({ reject }) => {
        reject(new Error("Connector routing worker terminated"));
      });
      pending.clear();
    };
  }, []);

  const requestRoute = useCallback((payload: RouteRequest) => {
    const worker = workerRef.current;
    if (!worker) return null;
    const id = (seqRef.current += 1);
    return new Promise<RouteResult>((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject });
      worker.postMessage({ id, ...payload });
    });
  }, []);

  return { requestRoute };
};
