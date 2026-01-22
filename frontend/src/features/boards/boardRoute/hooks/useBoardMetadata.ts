import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CanvasSettings } from "@/types/board";
import { getToken } from "@/features/auth/storage";
import { getBoardDetail } from "@/features/boards/api";
import type { Board } from "@/features/boards/types";
import { getApiErrorCode } from "@/shared/api/errors";
import type { NavigateFn } from "@/features/boards/boardRoute/types";

const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  width: 10000,
  height: 10000,
  backgroundColor: "#141414",
  gridSize: 20,
  gridEnabled: true,
  snapToGrid: true,
  showRulers: true,
  defaultZoom: 1,
};

export function useBoardMetadata(
  boardId: string,
  isAuthenticated: boolean,
  navigate: NavigateFn,
) {
  const token = getToken();
  const canLoad = isAuthenticated || Boolean(token);
  const queryClient = useQueryClient();
  const boardQueryKey = useMemo(
    () => ["boardDetail", boardId, token ?? ""],
    [boardId, token],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      if (!token) {
        navigate({ to: "/login" });
      }
    }
  }, [isAuthenticated, navigate, token]);

  const { data: board, error, refetch } = useQuery<Board, unknown>({
    queryKey: boardQueryKey,
    queryFn: () => getBoardDetail(boardId),
    enabled: canLoad,
  });

  const applyBoardMetadata = useCallback(
    (nextBoard: Board) => {
      queryClient.setQueryData<Board>(boardQueryKey, nextBoard);
    },
    [boardQueryKey, queryClient],
  );

  const refreshBoardMetadata = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const errorCode = error ? getApiErrorCode(error) : null;
  const boardTitle = board?.name ?? "Untitled Board";
  const boardDescription = board?.description ?? "";
  const canvasSettings = board?.canvas_settings ?? DEFAULT_CANVAS_SETTINGS;
  const isPublic = Boolean(board?.is_public);
  const isArchived =
    errorCode === "BOARD_ARCHIVED" ? true : Boolean(board?.archived_at);
  const isDeleted =
    errorCode === "BOARD_DELETED" ? true : Boolean(board?.deleted_at);

  return {
    boardTitle,
    boardDescription,
    canvasSettings,
    isPublic,
    isArchived,
    isDeleted,
    refreshBoardMetadata,
    applyBoardMetadata,
  };
}
