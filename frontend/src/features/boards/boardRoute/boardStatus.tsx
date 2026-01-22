import {
  BoardStatusScreen,
  type StatusMessage,
} from "@/features/boards/components/BoardStatusScreen";

type BoardStatusGateProps = {
  isDeleted: boolean;
  isArchived: boolean;
  queueState: { position: number } | null;
  archivedStatus: StatusMessage | null;
  deletedStatus: StatusMessage | null;
  isRestoring: boolean;
  isRestoringDeleted: boolean;
  onRestoreBoard: () => void;
  onRestoreDeletedBoard: () => void;
  onBackToDashboard: () => void;
  onRetryQueue: () => void;
  t: (key: string) => string;
};

export const getBoardStatusScreen = ({
  isDeleted,
  isArchived,
  queueState,
  archivedStatus,
  deletedStatus,
  isRestoring,
  isRestoringDeleted,
  onRestoreBoard,
  onRestoreDeletedBoard,
  onBackToDashboard,
  onRetryQueue,
  t,
}: BoardStatusGateProps) => {
  if (isDeleted) {
    return (
      <BoardStatusScreen
        title={t("board.deletedTitle")}
        subtitle={t("board.deletedSubtitle")}
        status={deletedStatus}
        primaryAction={{
          label: t("board.deletedRestore"),
          loadingLabel: t("board.deletedRestoring"),
          onClick: onRestoreDeletedBoard,
          isLoading: isRestoringDeleted,
        }}
        secondaryAction={{
          label: t("board.deletedBack"),
          onClick: onBackToDashboard,
          variant: "secondary",
        }}
        hint={t("board.deletedHint")}
      />
    );
  }

  if (isArchived) {
    return (
      <BoardStatusScreen
        title={t("board.archivedTitle")}
        subtitle={t("board.archivedSubtitle")}
        status={archivedStatus}
        primaryAction={{
          label: t("board.archivedRestore"),
          loadingLabel: t("board.archivedRestoring"),
          onClick: onRestoreBoard,
          isLoading: isRestoring,
        }}
        secondaryAction={{
          label: t("board.archivedBack"),
          onClick: onBackToDashboard,
          variant: "secondary",
        }}
        hint={t("board.archivedHint")}
      />
    );
  }

  if (queueState) {
    return (
      <BoardStatusScreen
        title="Board is full"
        subtitle="Waiting for an available slot to join this board."
        status={{
          tone: "error",
          message: `Queue position: ${queueState.position || 1}`,
        }}
        primaryAction={{
          label: "Retry now",
          onClick: onRetryQueue,
        }}
        secondaryAction={{
          label: "Back to dashboard",
          onClick: onBackToDashboard,
          variant: "secondary",
        }}
        hint="You will be admitted automatically when a slot opens."
      />
    );
  }

  return null;
};
