import { useMemo } from "react";

import type { CursorBroadcast, PresenceUser } from "@/features/boards/types";

type ConnectionStatus = "connecting" | "online" | "offline" | "reconnecting";

type SyncStatus = {
  connection: ConnectionStatus;
  pendingUpdates: boolean;
  localCacheReady: boolean;
};

type UsePresenceUiOptions = {
  cursors: Record<string, CursorBroadcast>;
  presenceUsers: Record<string, PresenceUser>;
  userId: string;
  syncStatus: SyncStatus;
  t: (key: string) => string;
};

export const usePresenceUi = ({
  cursors,
  presenceUsers,
  userId,
  syncStatus,
  t,
}: UsePresenceUiOptions) => {
  const syncLabel = useMemo(() => {
    if (!syncStatus.localCacheReady) {
      return t("board.syncLoadingLocal");
    }
    if (syncStatus.connection === "offline") {
      return t("board.syncOffline");
    }
    if (syncStatus.connection === "reconnecting") {
      return t("board.syncReconnecting");
    }
    if (syncStatus.connection === "connecting") {
      return t("board.syncConnecting");
    }
    if (syncStatus.pendingUpdates) {
      return t("board.syncSyncing");
    }
    return t("board.syncSaved");
  }, [syncStatus, t]);

  const syncTone: "neutral" | "ok" | "warn" =
    syncStatus.connection === "offline"
      ? "warn"
      : syncStatus.pendingUpdates || syncStatus.connection !== "online"
        ? "neutral"
        : "ok";

  const cursorList = useMemo(() => Object.values(cursors), [cursors]);

  const presenceList = useMemo(
    () =>
      Object.values(presenceUsers).filter(
        (presence) => presence.user_id !== userId,
      ),
    [presenceUsers, userId],
  );

  const visiblePresence = useMemo(
    () => presenceList.slice(0, 3),
    [presenceList],
  );

  const extraPresenceCount = useMemo(
    () => Math.max(0, presenceList.length - 3),
    [presenceList.length],
  );

  return {
    syncLabel,
    syncTone,
    cursorList,
    presenceList,
    visiblePresence,
    extraPresenceCount,
  };
};
