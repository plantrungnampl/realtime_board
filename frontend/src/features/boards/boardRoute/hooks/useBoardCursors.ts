import { useEffect, useState } from "react";
import type { Awareness } from "y-protocols/awareness";
import type { CursorBroadcast } from "@/types/board";
import { buildCursorMap } from "@/features/boards/boardRoute/presence";

const CURSOR_IDLE_MS = 5_000;
const PRESENCE_SWEEP_MS = 5_000;

export function useBoardCursors(awareness: Awareness | null) {
  const [cursors, setCursors] = useState<Record<string, CursorBroadcast>>({});

  useEffect(() => {
    if (!awareness) return;

    const syncAwarenessState = () => {
      setCursors((prev) => buildCursorMap(awareness, CURSOR_IDLE_MS, prev));
    };

    awareness.on("change", syncAwarenessState);
    awareness.on("update", syncAwarenessState);

    const sweepId = window.setInterval(syncAwarenessState, PRESENCE_SWEEP_MS);
    syncAwarenessState();

    return () => {
      awareness.off("change", syncAwarenessState);
      awareness.off("update", syncAwarenessState);
      window.clearInterval(sweepId);
      setCursors({});
    };
  }, [awareness]);

  return cursors;
}
