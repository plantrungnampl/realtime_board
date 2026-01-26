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
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<RouteResponse>) => {
      const message = event.data;
      const pending = pendingRef.current.get(message.id);
      if (!pending) return;
      pendingRef.current.delete(message.id);
      if ("error" in message) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message.result);
      }
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "Connector routing worker failed");
      pendingRef.current.forEach(({ reject }) => reject(error));
      pendingRef.current.clear();
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRef.current.forEach(({ reject }) => {
        reject(new Error("Connector routing worker terminated"));
      });
      pendingRef.current.clear();
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
