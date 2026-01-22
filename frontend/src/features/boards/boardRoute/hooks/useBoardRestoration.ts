import { useCallback, useState } from "react";
import type { TFunction } from "i18next";

import type { StatusMessage } from "@/features/boards/components/BoardStatusScreen";
import { restoreBoard, unarchiveBoard } from "@/features/boards/api";
import { getApiErrorMessage } from "@/shared/api/errors";

type UseBoardRestorationOptions = {
  boardId: string;
  refreshBoardMetadata: () => Promise<void>;
  t: TFunction;
};

export const useBoardRestoration = ({
  boardId,
  refreshBoardMetadata,
  t,
}: UseBoardRestorationOptions) => {
  const [archivedStatus, setArchivedStatus] = useState<StatusMessage | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [deletedStatus, setDeletedStatus] = useState<StatusMessage | null>(null);
  const [isRestoringDeleted, setIsRestoringDeleted] = useState(false);

  const handleRestoreBoard = useCallback(async () => {
    setArchivedStatus(null);
    setIsRestoring(true);
    try {
      await unarchiveBoard(boardId);
      await refreshBoardMetadata();
      setArchivedStatus({
        tone: "success",
        message: t("board.archivedRestoreSuccess"),
      });
    } catch (error) {
      setArchivedStatus({
        tone: "error",
        message: getApiErrorMessage(error, t("board.archivedRestoreError")),
      });
    } finally {
      setIsRestoring(false);
    }
  }, [boardId, refreshBoardMetadata, t]);

  const handleRestoreDeletedBoard = useCallback(async () => {
    setDeletedStatus(null);
    setIsRestoringDeleted(true);
    try {
      await restoreBoard(boardId);
      await refreshBoardMetadata();
      setDeletedStatus({
        tone: "success",
        message: t("board.deletedRestoreSuccess"),
      });
    } catch (error) {
      setDeletedStatus({
        tone: "error",
        message: getApiErrorMessage(error, t("board.deletedRestoreError")),
      });
    } finally {
      setIsRestoringDeleted(false);
    }
  }, [boardId, refreshBoardMetadata, t]);

  return {
    archivedStatus,
    isRestoring,
    deletedStatus,
    isRestoringDeleted,
    handleRestoreBoard,
    handleRestoreDeletedBoard,
  };
};
