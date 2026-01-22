import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  LayoutGrid,
  List,
  MoreHorizontal,
  Star,
  FileBox,
} from "lucide-react";
// import { useAppStore } from "@/store/useAppStore";
import { useNavigate } from "@tanstack/react-router";
import { CreateBoardDialog, type BoardUsageSnapshot } from "./CreateBoardDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteBoard, getBoardsList, toggleBoardFavorite } from "@/features/boards/api";
import type { Board, BoardFavoriteResponse } from "@/types/board";
import { useOrganizationStore } from "@/features/organizations/state/useOrganizationStore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getOrganizationUsage } from "@/features/organizations/api";
import type { OrganizationUsage } from "@/features/organizations/types";
import { getApiErrorMessage } from "@/shared/api/errors";
import { useAppStore } from "@/store/useAppStore";
import type { SubscriptionTier } from "@/features/auth/types";
import { BoardSettingsDialog } from "@/features/boards/components/BoardSettingsDialog";
import type { DashboardView } from "./dashboardView";
import { DEFAULT_DASHBOARD_VIEW } from "./dashboardView";
import type {
  DashboardOwnerFilter,
  DashboardSort,
} from "./dashboardFilters";
import {
  DEFAULT_DASHBOARD_OWNER_FILTER,
  DEFAULT_DASHBOARD_SORT,
} from "./dashboardFilters";

type BoardListProps = {
  view?: DashboardView;
  ownerFilter?: DashboardOwnerFilter;
  sortBy?: DashboardSort;
  onFilterChange?: (next: {
    view?: DashboardView;
    owner?: DashboardOwnerFilter;
    sort?: DashboardSort;
  }) => void;
};

export function BoardList({
  view = DEFAULT_DASHBOARD_VIEW,
  ownerFilter = DEFAULT_DASHBOARD_OWNER_FILTER,
  sortBy = DEFAULT_DASHBOARD_SORT,
  onFilterChange,
}: BoardListProps) {
  // const user = useAppStore((state) => state.user);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAppStore((state) => state.user);
  const currentOrganization = useOrganizationStore(
    (state) => state.currentOrganization,
  );
  const organizationId = currentOrganization?.id;
  const listQueryKey = useMemo(
    () => ["boardsList", organizationId ?? "personal"],
    [organizationId],
  );
  const [settingsBoardId, setSettingsBoardId] = useState<string | null>(null);
  const rowBlockTimerRef = useRef<number | null>(null);
  const rowClickBlockRef = useRef(false);
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);

  const {
    data: boards,
    isLoading,
    isError,
    error,
  } = useQuery<Board[], Error>({
    queryKey: listQueryKey,
    queryFn: () => getBoardsList({ organizationId }),
  });

  const {
    data: usage,
    isLoading: isUsageLoading,
    isError: isUsageError,
    error: usageError,
  } = useQuery<OrganizationUsage, Error>({
    queryKey: ["organizationUsage", organizationId],
    queryFn: () => getOrganizationUsage(organizationId ?? ""),
    enabled: Boolean(organizationId),
  });

  const scopedBoards = useMemo(() => {
    if (!boards) return [];
    if (currentOrganization) {
      return boards.filter(
        (board) => board.organization_id === currentOrganization.id,
      );
    }
    return boards.filter((board) => !board.organization_id);
  }, [boards, currentOrganization]);

  const ownerFilteredBoards = useMemo(() => {
    if (ownerFilter === "any") {
      return scopedBoards;
    }
    if (!user?.id) {
      return scopedBoards;
    }
    if (ownerFilter === "me") {
      return scopedBoards.filter((board) => board.created_by === user.id);
    }
    return scopedBoards.filter((board) => board.created_by !== user.id);
  }, [ownerFilter, scopedBoards, user?.id]);

  const visibleBoards = useMemo(() => {
    let next = ownerFilteredBoards;
    if (view === "starred") {
      next = next.filter((board) => board.is_favorite);
    } else if (view === "recent") {
      next = next.filter((board) => Boolean(board.last_accessed_at));
    }

    return sortBoards(next, sortBy);
  }, [ownerFilteredBoards, sortBy, view]);

  const boardScopeLabel = currentOrganization?.name ?? "Personal workspace";
  const accessibleBoardCount = scopedBoards.length;
  const hasHiddenBoards =
    Boolean(currentOrganization) &&
    (usage?.boards_used ?? 0) > accessibleBoardCount;
  const personalUsage = currentOrganization
    ? null
    : buildPersonalBoardUsage(
        boards,
        user?.id,
        user?.subscription_tier,
        user?.subscription_expires_at,
      );
  const personalUsageLoading = !currentOrganization && isLoading;
  const personalUsageError =
    !currentOrganization && !personalUsage && !isLoading
      ? t("org.usageUnavailable")
      : null;
  const showHiddenBoardsNotice = view === "home" && hasHiddenBoards;
  const emptyMessage = showHiddenBoardsNotice
    ? t("org.boardsNoAccess", {
        count: usage?.boards_used ?? 0,
      })
    : view === "recent"
      ? t("board.listEmptyRecent")
      : view === "starred"
        ? t("board.listEmptyStarred")
        : t("board.listEmpty");

  const handleBoardUpdated = useCallback(
    (updatedBoard: Board) => {
      queryClient.setQueryData<Board[]>(listQueryKey, (current) => {
        if (!current) return current;
        return current.map((board) =>
          board.id === updatedBoard.id ? { ...board, ...updatedBoard } : board,
        );
      });
    },
    [listQueryKey, queryClient],
  );

  const refreshBoards = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: listQueryKey,
    });
  }, [listQueryKey, queryClient]);

  const handleDeleteBoard = useCallback(
    async (board: Board) => {
      const confirmed = window.confirm(t("board.rowDeleteConfirm"));
      if (!confirmed) return;
      setDeletingBoardId(board.id);
      try {
        await deleteBoard(board.id);
        await refreshBoards();
      } catch (error) {
        window.alert(getApiErrorMessage(error, t("board.rowDeleteError")));
      } finally {
        setDeletingBoardId(null);
      }
    },
    [refreshBoards, t],
  );

  const favoriteMutation = useMutation<
    BoardFavoriteResponse,
    Error,
    string
  >({
    mutationFn: (boardId: string) => toggleBoardFavorite(boardId),
    onSuccess: (response, boardId) => {
      queryClient.setQueryData<Board[]>(listQueryKey, (current) => {
        if (!current) return current;
        return current.map((board) =>
          board.id === boardId
            ? { ...board, is_favorite: response.is_favorite }
            : board,
        );
      });
    },
    onError: (favoriteError) => {
      window.alert(getApiErrorMessage(favoriteError, t("board.favoriteError")));
    },
  });

  const viewOptions: Array<{ value: DashboardView; label: string }> = [
    { value: "home", label: t("board.filters.all") },
    { value: "recent", label: t("board.filters.recent") },
    { value: "starred", label: t("board.filters.starred") },
  ];
  const ownerOptions: Array<{
    value: DashboardOwnerFilter;
    label: string;
  }> = [
    { value: "any", label: t("board.filters.ownedByAnyone") },
    { value: "me", label: t("board.filters.ownedByMe") },
    { value: "others", label: t("board.filters.ownedByOthers") },
  ];
  const sortOptions: Array<{ value: DashboardSort; label: string }> = [
    { value: "last_opened", label: t("board.filters.sort.lastOpened") },
    { value: "last_edited", label: t("board.filters.sort.lastEdited") },
    { value: "name", label: t("board.filters.sort.name") },
    { value: "created", label: t("board.filters.sort.created") },
  ];

  const selectedViewLabel =
    viewOptions.find((option) => option.value === view)?.label ??
    t("board.filters.all");
  const selectedOwnerLabel =
    ownerOptions.find((option) => option.value === ownerFilter)?.label ??
    t("board.filters.ownedByAnyone");
  const selectedSortLabel =
    sortOptions.find((option) => option.value === sortBy)?.label ??
    t("board.filters.sort.lastOpened");

  const handleFilterChange = useCallback(
    (next: {
      view?: DashboardView;
      owner?: DashboardOwnerFilter;
      sort?: DashboardSort;
    }) => {
      onFilterChange?.(next);
    },
    [onFilterChange],
  );

  const closeSettingsDialog = useCallback(() => {
    if (rowBlockTimerRef.current !== null) {
      window.clearTimeout(rowBlockTimerRef.current);
      rowBlockTimerRef.current = null;
    }
    rowClickBlockRef.current = true;
    setSettingsBoardId(null);
    rowBlockTimerRef.current = window.setTimeout(() => {
      rowClickBlockRef.current = false;
      rowBlockTimerRef.current = null;
    }, 200);
  }, []);

  useEffect(
    () => () => {
      if (rowBlockTimerRef.current !== null) {
        window.clearTimeout(rowBlockTimerRef.current);
        rowBlockTimerRef.current = null;
      }
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-text-primary">
              Boards in {boardScopeLabel}
            </h2>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm">
                Explore templates
              </Button>
              <CreateBoardDialog
                personalUsage={personalUsage}
                personalUsageLoading={personalUsageLoading}
                personalUsageError={personalUsageError}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            {/* Filter placehoders */}
            <div className="flex items-center gap-2">
              <div className="h-8 w-24 bg-neutral-700 animate-pulse rounded-lg"></div>
              <div className="h-8 w-32 bg-neutral-700 animate-pulse rounded-lg"></div>
              <div className="h-8 w-20 bg-neutral-700 animate-pulse rounded-lg ml-4"></div>
            </div>
            {/* View toggle placeholders */}
            <div className="flex items-center bg-bg-surface rounded-lg p-0.5 border border-border">
              <div className="h-7 w-7 bg-neutral-700 animate-pulse rounded-lg"></div>
              <div className="h-7 w-7 bg-neutral-700 animate-pulse rounded-lg"></div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-bg-surface border-b border-border/50 transition-colors group cursor-pointer animate-pulse"
            >
              <div className="col-span-6 flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-neutral-700"></div>
                <div className="h-4 w-48 bg-neutral-700 rounded"></div>
              </div>
              <div className="col-span-2 h-4 w-20 bg-neutral-700 rounded"></div>
              <div className="col-span-2 h-4 w-24 bg-neutral-700 rounded"></div>
              <div className="col-span-2 h-4 w-16 bg-neutral-700 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-red-500 p-4">
        {getApiErrorMessage(error, "Unable to load boards.")}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header & Filters */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-primary">
            Boards in {boardScopeLabel}
          </h2>
          <div className="flex items-center gap-3">
            {currentOrganization ? (
              <UsageWidget
                usage={usage}
                isLoading={isUsageLoading}
                errorMessage={
                  isUsageError && usageError
                    ? getApiErrorMessage(usageError, t("org.usageUnavailable"))
                    : null
                }
                boardsAccessible={accessibleBoardCount}
                t={t}
              />
            ) : (
              <PersonalUsageWidget
                usage={personalUsage}
                isLoading={personalUsageLoading}
                errorMessage={personalUsageError}
                t={t}
              />
            )}
            <Button variant="secondary" size="sm">
              Explore templates
            </Button>
            <CreateBoardDialog
              personalUsage={personalUsage}
              personalUsageLoading={personalUsageLoading}
              personalUsageError={personalUsageError}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="border border-border text-text-secondary font-normal gap-2"
                >
                  {selectedViewLabel}
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-48 bg-surface border-border text-text-primary"
              >
                {viewOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    className="cursor-pointer focus:bg-elevated"
                    onSelect={() => handleFilterChange({ view: option.value })}
                  >
                    <span
                      className={
                        option.value === view
                          ? "text-sm font-medium text-text-primary"
                          : "text-sm text-text-secondary"
                      }
                    >
                      {option.label}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="border border-border text-text-secondary font-normal gap-2"
                >
                  {selectedOwnerLabel}
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-56 bg-surface border-border text-text-primary"
              >
                {ownerOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    className="cursor-pointer focus:bg-elevated"
                    onSelect={() => handleFilterChange({ owner: option.value })}
                  >
                    <span
                      className={
                        option.value === ownerFilter
                          ? "text-sm font-medium text-text-primary"
                          : "text-sm text-text-secondary"
                      }
                    >
                      {option.label}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-2 ml-4">
              <span className="text-xs text-text-muted">
                {t("board.filters.sortBy")}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="border border-border text-text-secondary font-normal gap-2"
                  >
                    {selectedSortLabel}
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-48 bg-surface border-border text-text-primary"
                >
                  {sortOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      className="cursor-pointer focus:bg-elevated"
                      onSelect={() => handleFilterChange({ sort: option.value })}
                    >
                      <span
                        className={
                          option.value === sortBy
                            ? "text-sm font-medium text-text-primary"
                            : "text-sm text-text-secondary"
                        }
                      >
                        {option.label}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center bg-bg-surface rounded-lg p-0.5 border border-border">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 rounded hover:bg-bg-elevated"
            >
              <LayoutGrid className="w-4 h-4 text-text-muted" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 rounded bg-bg-elevated shadow-sm"
            >
              <List className="w-4 h-4 text-text-primary" />
            </Button>
          </div>
        </div>
      </div>

      {/* Board List / Table */}
      <div className="w-full">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-text-muted border-b border-border">
          <div className="col-span-6">Name</div>
          <div className="col-span-2">Online users</div>
          <div className="col-span-2">Last opened</div>
          <div className="col-span-2">Owner</div>
        </div>

        {/* Table Body */}
        <div className="flex flex-col">
          {visibleBoards.length === 0 ? (
            <div className="p-4 text-center text-text-muted">
              {emptyMessage}
            </div>
          ) : (
            visibleBoards.map((board) => (
              <div
                key={board.id}
                className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-bg-surface border-b border-border/50 transition-colors group cursor-pointer"
                onClick={() => {
                  if (rowClickBlockRef.current || settingsBoardId) return;
                  navigate({ to: `/board/${board.id}` });
                }}
              >
                <div className="col-span-6 flex items-center gap-3">
                  <div
                    className={`p-2 rounded bg-bg-elevated text-text-primary`}
                  >
                    <FileBox className="w-4 h-4" /> {/* Generic icon for now */}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-text-primary">
                      {board.name}
                    </span>
                    <span className="text-xs text-text-muted">
                      Owned by {board.username || t("board.ownerUnknown")},{" "}
                      {new Date(board.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="col-span-2">
                  {/* Online users placeholder */}
                </div>

                <div className="col-span-2 text-xs text-text-secondary">
                  {formatBoardDate(board.last_accessed_at)}
                </div>

                <div className="col-span-2 flex items-center justify-between">
                  <span className="text-xs text-text-secondary">
                    {board.username || t("board.ownerUnknown")}
                  </span>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-bg-elevated"
                      onClick={(event) => {
                        event.stopPropagation();
                        favoriteMutation.mutate(board.id);
                      }}
                      disabled={
                        favoriteMutation.isPending &&
                        favoriteMutation.variables === board.id
                      }
                      aria-label={t("board.favoriteToggle")}
                    >
                      <Star
                        className={
                          board.is_favorite
                            ? "w-4 h-4 text-yellow-400"
                            : "w-4 h-4 text-text-muted hover:text-yellow-500"
                        }
                        fill={board.is_favorite ? "currentColor" : "none"}
                      />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-bg-elevated"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MoreHorizontal className="w-4 h-4 text-text-muted" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-48 bg-surface border-border text-text-primary"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-elevated"
                          onSelect={(event) => {
                            event.stopPropagation();
                            setSettingsBoardId(board.id);
                          }}
                        >
                          {t("board.rowEdit")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-elevated"
                          onSelect={(event) => {
                            event.stopPropagation();
                            navigate({ to: `/board/${board.id}` });
                          }}
                        >
                          {t("board.rowOpen")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem
                          className="cursor-pointer text-red-400 focus:text-red-400 focus:bg-red-500/10"
                          disabled={deletingBoardId === board.id}
                          onSelect={(event) => {
                            event.stopPropagation();
                            handleDeleteBoard(board);
                          }}
                        >
                          {deletingBoardId === board.id
                            ? t("board.rowDeleting")
                            : t("board.rowDelete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <BoardSettingsDialog
                  boardId={board.id}
                  boardTitle={board.name}
                  boardDescription={board.description ?? ""}
                  isPublic={Boolean(board.is_public)}
                  isArchived={Boolean(board.archived_at)}
                  boardRole={board.created_by === user?.id ? "owner" : null}
                  onBoardUpdated={handleBoardUpdated}
                  onRefresh={refreshBoards}
                  open={settingsBoardId === board.id}
                  onOpenChange={(open) => {
                    if (!open) {
                      closeSettingsDialog();
                      return;
                    }
                    setSettingsBoardId(board.id);
                  }}
                  hideTrigger
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function sortBoards(boards: Board[], sortBy: DashboardSort) {
  const copy = [...boards];
  if (sortBy === "name") {
    return copy.sort((a, b) => a.name.localeCompare(b.name));
  }
  if (sortBy === "created") {
    return copy.sort(
      (a, b) => resolveDateValue(b.created_at) - resolveDateValue(a.created_at),
    );
  }
  if (sortBy === "last_edited") {
    return copy.sort(
      (a, b) => resolveDateValue(b.updated_at) - resolveDateValue(a.updated_at),
    );
  }
  return copy.sort(
    (a, b) =>
      resolveLastOpenedValue(b) - resolveLastOpenedValue(a),
  );
}

function resolveLastOpenedValue(board: Board) {
  if (board.last_accessed_at) {
    return resolveDateValue(board.last_accessed_at);
  }
  return 0;
}

function resolveDateValue(value?: string | null) {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

type UsageWidgetProps = {
  usage: OrganizationUsage | undefined;
  isLoading: boolean;
  errorMessage: string | null;
  boardsAccessible?: number;
  t: (key: string, options?: Record<string, string>) => string;
};

type PersonalUsageWidgetProps = {
  usage: BoardUsageSnapshot | null;
  isLoading: boolean;
  errorMessage: string | null;
  t: (key: string, options?: Record<string, string>) => string;
};

function PersonalUsageWidget({
  usage,
  isLoading,
  errorMessage,
  t,
}: PersonalUsageWidgetProps) {
  if (isLoading) {
    return (
      <div className="hidden lg:flex items-center gap-3 rounded-lg border border-border bg-bg-base px-3 py-2 text-xs text-text-muted">
        {t("org.usageLoading")}
      </div>
    );
  }

  if (errorMessage || !usage) {
    return (
      <div className="hidden lg:flex items-center gap-3 rounded-lg border border-border bg-bg-base px-3 py-2 text-xs text-text-muted">
        {errorMessage ?? t("org.usageUnavailable")}
      </div>
    );
  }

  return (
    <div className="hidden lg:flex items-center gap-3 rounded-lg border border-border bg-bg-base px-3 py-2 text-xs">
      <span className="text-text-muted">{t("org.usageBoards")}</span>
      <span className={usage.boards_warning ? "text-yellow-400" : "text-text-primary"}>
        {formatUsageLabel(usage.boards_used, usage.boards_limit, undefined, t)}
      </span>
    </div>
  );
}

function UsageWidget({
  usage,
  isLoading,
  errorMessage,
  boardsAccessible,
  t,
}: UsageWidgetProps) {
  if (isLoading) {
    return (
      <div className="hidden lg:flex items-center gap-3 rounded-lg border border-border bg-bg-base px-3 py-2 text-xs text-text-muted">
        {t("org.usageLoading")}
      </div>
    );
  }

  if (errorMessage || !usage) {
    return (
      <div className="hidden lg:flex items-center gap-3 rounded-lg border border-border bg-bg-base px-3 py-2 text-xs text-text-muted">
        {errorMessage ?? t("org.usageUnavailable")}
      </div>
    );
  }

  const entries = [
    {
      key: "members",
      label: t("org.usageMembers"),
      used: usage.members_used,
      limit: usage.members_limit,
      warning: usage.members_warning,
    },
    {
      key: "boards",
      label: t("org.usageBoards"),
      used: usage.boards_used,
      limit: usage.boards_limit,
      warning: usage.boards_warning,
    },
    {
      key: "storage",
      label: t("org.usageStorage"),
      used: usage.storage_used_mb,
      limit: usage.storage_limit_mb,
      warning: usage.storage_warning,
      unit: "mb",
    },
  ];

  return (
    <div className="hidden lg:flex items-center gap-4 rounded-lg border border-border bg-bg-base px-3 py-2 text-xs">
      {entries.map((entry) => (
        <div key={entry.key} className="flex flex-col leading-tight">
          <span className="text-text-muted">{entry.label}</span>
          <span className={entry.warning ? "text-yellow-400" : "text-text-primary"}>
            {entry.key === "boards"
              ? formatBoardUsageLabel(
                  entry.used,
                  entry.limit,
                  boardsAccessible,
                  t,
                )
              : formatUsageLabel(entry.used, entry.limit, entry.unit, t)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatBoardDate(value?: string | null) {
  if (!value) {
    return "-";
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "-";
  }
  return new Date(timestamp).toLocaleDateString();
}

function formatUsageLabel(
  used: number,
  limit: number,
  unit: string | undefined,
  t: (key: string, options?: Record<string, string>) => string,
) {
  const usedLabel = formatUsageValue(used, unit);
  if (limit <= 0) {
    return t("org.usageUnlimited", { used: usedLabel });
  }

  const limitLabel = formatUsageValue(limit, unit);
  return t("org.usageLimit", { used: usedLabel, limit: limitLabel });
}

function formatBoardUsageLabel(
  used: number,
  limit: number,
  accessible: number | undefined,
  t: (key: string, options?: Record<string, string>) => string,
) {
  if (accessible === undefined || accessible >= used) {
    return formatUsageLabel(used, limit, undefined, t);
  }

  const accessibleLabel = formatUsageValue(accessible, undefined);
  const totalLabel = formatUsageValue(used, undefined);
  if (limit <= 0) {
    return t("org.usageUnlimitedAccessible", {
      accessible: accessibleLabel,
      total: totalLabel,
    });
  }

  const limitLabel = formatUsageValue(limit, undefined);
  return t("org.usageLimitAccessible", {
    accessible: accessibleLabel,
    limit: limitLabel,
    total: totalLabel,
  });
}

function formatUsageValue(value: number, unit: string | undefined) {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (unit === "mb") {
    return formatStorage(safeValue);
  }

  return safeValue.toString();
}

function formatStorage(value: number) {
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} GB`;
  }

  return `${value} MB`;
}

const BOARD_LIMITS_BY_TIER: Record<SubscriptionTier, number> = {
  free: 5,
  starter: 25,
  professional: 0,
  enterprise: 0,
};

function getBoardLimitForTier(
  tier: SubscriptionTier | undefined,
  expiresAt: string | null | undefined,
) {
  const normalizedTier = normalizeTier(tier);
  if (normalizedTier === "free") {
    return BOARD_LIMITS_BY_TIER.free;
  }
  if (!expiresAt) {
    return BOARD_LIMITS_BY_TIER.free;
  }
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return BOARD_LIMITS_BY_TIER.free;
  }
  return BOARD_LIMITS_BY_TIER[normalizedTier];
}

function normalizeTier(tier: SubscriptionTier | undefined): SubscriptionTier {
  if (!tier) {
    return "free";
  }
  const normalized = tier.toLowerCase();
  if (normalized in BOARD_LIMITS_BY_TIER) {
    return normalized as SubscriptionTier;
  }
  return "free";
}

function isUsageWarning(current: number, limit: number) {
  if (limit <= 0) {
    return false;
  }
  return current * 100 >= limit * 80;
}

function buildPersonalBoardUsage(
  boards: Board[] | undefined,
  userId: string | undefined,
  tier: SubscriptionTier | undefined,
  expiresAt: string | null | undefined,
): BoardUsageSnapshot | null {
  if (!boards || !userId) {
    return null;
  }
  const ownedBoards = boards.filter(
    (board) => !board.organization_id && board.created_by === userId,
  );
  const boardsUsed = ownedBoards.length;
  const boardsLimit = getBoardLimitForTier(tier, expiresAt);
  return {
    boards_used: boardsUsed,
    boards_limit: boardsLimit,
    boards_warning: isUsageWarning(boardsUsed, boardsLimit),
  };
}
