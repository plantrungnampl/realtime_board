import { ChevronLeft } from "lucide-react";
import { BoardShareDialog } from "@/features/boards/components/BoardShareDialog";
import { BoardSettingsDialog } from "@/features/boards/components/BoardSettingsDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { BoardRole, Board, PresenceUser } from "@/features/boards/types";
import type { User } from "@/types/auth";

type BoardHeaderProps = {
  boardId: string;
  boardTitle: string;
  boardDescription: string;
  isPublic: boolean;
  isArchived: boolean;
  canEdit: boolean;
  isRoleLoading: boolean;
  boardRole: BoardRole | null;
  visiblePresence: PresenceUser[];
  extraPresenceCount: number;
  user: User | null;
  backLabel: string;
  readOnlyLabel: string;
  syncLabel: string;
  syncTone?: "neutral" | "ok" | "warn";
  onBack: () => void;
  onBoardUpdated: (board: Board) => void;
  onRefresh: () => Promise<void>;
  onRoleOverride?: (role: BoardRole) => void;
};

export function BoardHeader({
  boardId,
  boardTitle,
  boardDescription,
  isPublic,
  isArchived,
  canEdit,
  isRoleLoading,
  boardRole,
  visiblePresence,
  extraPresenceCount,
  user,
  backLabel,
  readOnlyLabel,
  syncLabel,
  syncTone = "neutral",
  onBack,
  onBoardUpdated,
  onRefresh,
  onRoleOverride,
}: BoardHeaderProps) {
  const statusDotClass = (status: PresenceUser["status"]) => {
    switch (status) {
      case "idle":
        return "bg-yellow-400";
      case "away":
        return "bg-neutral-500";
      default:
        return "bg-green-400";
    }
  };

  const syncToneStyle = () => {
    switch (syncTone) {
      case "ok":
        return {
          dot: "bg-emerald-400",
          text: "text-emerald-300",
        };
      case "warn":
        return {
          dot: "bg-amber-400",
          text: "text-amber-300",
        };
      default:
        return {
          dot: "bg-neutral-500",
          text: "text-neutral-400",
        };
    }
  };

  const syncToneClass = syncToneStyle();

  return (
    <header className="h-14 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm px-4 flex items-center justify-between z-50">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          type="button"
          aria-label={backLabel}
          className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-neutral-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/60"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-semibold text-neutral-200 flex items-center gap-2">
            <span>{boardTitle}</span>
            {isPublic && (
              <span className="inline-flex items-center rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
                Public
              </span>
            )}
            {!canEdit && !isRoleLoading && (
              <span className="inline-flex items-center rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
                {readOnlyLabel}
              </span>
            )}
          </h1>
          <p
            className={`text-xs flex items-center gap-2 ${syncToneClass.text}`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${syncToneClass.dot}`}
            />
            <span>{syncLabel}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">
          {visiblePresence.map((user) => (
            <div
              key={user.user_id}
              className="relative w-8 h-8 rounded-full border-2 border-neutral-900 overflow-hidden flex items-center justify-center text-[10px] font-semibold text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900"
              style={{ backgroundColor: user.color ?? "#EAB308" }}
              title={user.display_name}
              role="img"
              aria-label={`${user.display_name} (${user.status})`}
              tabIndex={0}
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                user.display_name.slice(0, 2).toUpperCase()
              )}
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-neutral-900 ${statusDotClass(
                  user.status,
                )}`}
              />
            </div>
          ))}
          {extraPresenceCount > 0 && (
            <div
              className="w-8 h-8 rounded-full bg-neutral-800 border-2 border-neutral-900 flex items-center justify-center text-xs text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900"
              role="img"
              aria-label={`${extraPresenceCount} more users`}
              tabIndex={0}
            >
              +{extraPresenceCount}
            </div>
          )}
        </div>
        <BoardSettingsDialog
          boardId={boardId}
          boardTitle={boardTitle}
          boardDescription={boardDescription}
          isPublic={isPublic}
          isArchived={isArchived}
          boardRole={boardRole}
          onBoardUpdated={onBoardUpdated}
          onRefresh={onRefresh}
          onRoleOverride={onRoleOverride}
        />
        <BoardShareDialog boardId={boardId} />
        <Avatar className="w-9 h-9 border-2 border-neutral-800">
          <AvatarImage src={user?.avatar_url || undefined} />
          <AvatarFallback className="bg-blue-600 text-white">
            {user?.display_name?.slice(0, 2).toUpperCase() || "ME"}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
