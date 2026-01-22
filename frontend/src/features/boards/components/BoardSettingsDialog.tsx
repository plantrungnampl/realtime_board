import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";

import {
  archiveBoard,
  deleteBoard,
  listBoardMembers,
  transferBoardOwnership,
  unarchiveBoard,
  updateBoard,
} from "@/features/boards/api";
import { resolveEffectivePermissions, resolveRolePermissions } from "@/features/boards/permissions";
import type { Board, BoardMember, BoardRole } from "@/features/boards/types";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { getApiErrorMessage } from "@/shared/api/errors";

type StatusMessage = {
  tone: "success" | "error";
  message: string;
};

type BoardSettingsDialogProps = {
  boardId: string;
  boardTitle: string;
  boardDescription: string;
  isPublic: boolean;
  isArchived: boolean;
  boardRole: BoardRole | null;
  onBoardUpdated: (board: Board) => void;
  onRefresh: () => Promise<void>;
  onRoleOverride?: (role: BoardRole) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

export function BoardSettingsDialog({
  boardId,
  boardTitle,
  boardDescription,
  isPublic,
  isArchived,
  boardRole,
  onBoardUpdated,
  onRefresh,
  onRoleOverride,
  open,
  onOpenChange,
  hideTrigger = false,
}: BoardSettingsDialogProps) {
  const { t } = useTranslation();
  const user = useAppStore((state) => state.user);
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === "boolean";
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange ?? (() => undefined) : setInternalOpen;
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [name, setName] = useState(boardTitle);
  const [description, setDescription] = useState(boardDescription);
  const [visibility, setVisibility] = useState(isPublic ? "public" : "private");

  const [members, setMembers] = useState<BoardMember[]>([]);
  const [membersStatus, setMembersStatus] = useState<StatusMessage | null>(null);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState("");

  const currentMember = useMemo(
    () => members.find((member) => member.user.id === user?.id),
    [members, user?.id],
  );
  const resolvedRole = boardRole ?? currentMember?.role ?? null;
  const currentPermissions = currentMember
    ? resolveEffectivePermissions(
        currentMember.role,
        currentMember.custom_permissions,
        currentMember.effective_permissions ?? null,
      )
    : resolvedRole
      ? resolveRolePermissions(resolvedRole)
      : null;
  const canManageBoard = currentPermissions?.canManageBoard
    ?? (resolvedRole === "owner" || resolvedRole === "admin");
  const canTransferOwnership = resolvedRole === "owner";
  const canDeleteBoard = resolvedRole === "owner";
  const canEditBoard = canManageBoard && !isArchived;

  const loadMembers = useCallback(async () => {
    setIsMembersLoading(true);
    setMembersStatus(null);
    try {
      const data = await listBoardMembers(boardId);
      setMembers(data);
    } catch (error) {
      setMembers([]);
      setMembersStatus({
        tone: "error",
        message: getApiErrorMessage(error, t("board.settingsMembersError")),
      });
    } finally {
      setIsMembersLoading(false);
    }
  }, [boardId, t]);

  useEffect(() => {
    if (!isOpen) return;
    setName(boardTitle);
    setDescription(boardDescription);
    setVisibility(isPublic ? "public" : "private");
    setStatus(null);
    setMembersStatus(null);
    setNewOwnerId("");
    loadMembers().catch(() => undefined);
  }, [boardDescription, boardTitle, isOpen, isPublic, loadMembers]);

  const currentOwner = useMemo(
    () => members.find((member) => member.role === "owner"),
    [members],
  );
  const transferOptions = useMemo(
    () =>
      members.filter((member) =>
        currentOwner ? member.user.id !== currentOwner.user.id : true,
      ),
    [currentOwner, members],
  );

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditBoard) return;
    setStatus(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setStatus({
        tone: "error",
        message: t("board.settingsNameRequired"),
      });
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateBoard(boardId, {
        name: trimmedName,
        description: description.trim(),
        is_public: visibility === "public",
      });
      onBoardUpdated(updated);
      setStatus({
        tone: "success",
        message: t("board.settingsSaved"),
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getApiErrorMessage(error, t("board.settingsSaveError")),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!canManageBoard) return;
    const confirmed = window.confirm(t("board.settingsArchiveConfirm"));
    if (!confirmed) return;
    setStatus(null);
    setIsArchiving(true);
    try {
      await archiveBoard(boardId);
      await onRefresh();
      setStatus({
        tone: "success",
        message: t("board.settingsArchived"),
      });
      setIsOpen(false);
    } catch (error) {
      setStatus({
        tone: "error",
        message: getApiErrorMessage(error, t("board.settingsArchiveError")),
      });
    } finally {
      setIsArchiving(false);
    }
  };

  const handleUnarchive = async () => {
    if (!canManageBoard) return;
    const confirmed = window.confirm(t("board.settingsUnarchiveConfirm"));
    if (!confirmed) return;
    setStatus(null);
    setIsArchiving(true);
    try {
      await unarchiveBoard(boardId);
      await onRefresh();
      setStatus({
        tone: "success",
        message: t("board.settingsUnarchived"),
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getApiErrorMessage(error, t("board.settingsUnarchiveError")),
      });
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDeleteBoard = async () => {
    if (!canDeleteBoard) return;
    const confirmed = window.confirm(t("board.settingsDeleteConfirm"));
    if (!confirmed) return;
    setStatus(null);
    setIsDeleting(true);
    try {
      await deleteBoard(boardId);
      await onRefresh();
      setStatus({
        tone: "success",
        message: t("board.settingsDeleted"),
      });
      setIsOpen(false);
    } catch (error) {
      setStatus({
        tone: "error",
        message: getApiErrorMessage(error, t("board.settingsDeleteError")),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!canTransferOwnership) return;
    const target = members.find((member) => member.user.id === newOwnerId);
    if (!target) {
      setMembersStatus({
        tone: "error",
        message: t("board.settingsTransferSelect"),
      });
      return;
    }
    const confirmed = window.confirm(
      t("board.settingsTransferConfirm", {
        name: resolveMemberName(target),
      }),
    );
    if (!confirmed) return;
    setMembersStatus(null);
    setIsTransferring(true);
    try {
      await transferBoardOwnership(boardId, { new_owner_id: newOwnerId });
      await loadMembers();
      onRoleOverride?.(newOwnerId === user?.id ? "owner" : "admin");
      setMembersStatus({
        tone: "success",
        message: t("board.settingsTransferSuccess"),
      });
      setNewOwnerId("");
    } catch (error) {
      setMembersStatus({
        tone: "error",
        message: getApiErrorMessage(error, t("board.settingsTransferError")),
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const visibilityLabel =
    visibility === "public"
      ? t("board.settingsVisibilityPublic")
      : t("board.settingsVisibilityPrivate");

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="secondary" className="gap-2">
            <Settings className="h-4 w-4" />
            {t("board.settings")}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[820px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("board.settingsTitle")}</DialogTitle>
          <DialogDescription>{t("board.settingsSubtitle")}</DialogDescription>
        </DialogHeader>

        {status && (
          <div
            className={
              status.tone === "success"
                ? "mt-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
                : "mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
            }
          >
            {status.message}
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-surface p-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-text-primary">
                {t("board.settingsDetailsTitle")}
              </h3>
              <p className="text-sm text-text-secondary">
                {t("board.settingsDetailsSubtitle")}
              </p>
              {!canManageBoard && (
                <p className="text-xs text-text-muted">
                  {t("board.settingsReadOnlyHint")}
                </p>
              )}
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="board_settings_name">
                  {t("board.settingsNameLabel")}
                </Label>
                <Input
                  id="board_settings_name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("board.settingsNamePlaceholder")}
                  disabled={!canEditBoard}
                  className="h-10 bg-bg-base border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="board_settings_description">
                  {t("board.settingsDescriptionLabel")}
                </Label>
                <textarea
                  id="board_settings_description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("board.settingsDescriptionPlaceholder")}
                  disabled={!canEditBoard}
                  className="min-h-[88px] w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 disabled:opacity-60"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="board_settings_visibility">
                  {t("board.settingsVisibilityLabel")}
                </Label>
                <select
                  id="board_settings_visibility"
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value)}
                  disabled={!canEditBoard}
                  className="h-10 w-full rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 disabled:opacity-60"
                >
                  <option value="public">{t("board.settingsVisibilityPublic")}</option>
                  <option value="private">{t("board.settingsVisibilityPrivate")}</option>
                </select>
                <p className="text-xs text-text-muted">{visibilityLabel}</p>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={!canEditBoard || isSaving}>
                  {isSaving
                    ? t("board.settingsSaving")
                    : t("board.settingsSave")}
                </Button>
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-text-primary">
                {t("board.settingsTransferTitle")}
              </h3>
              <p className="text-sm text-text-secondary">
                {t("board.settingsTransferSubtitle")}
              </p>
            </div>

            {membersStatus && (
              <div
                className={
                  membersStatus.tone === "success"
                    ? "mt-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
                    : "mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
                }
              >
                {membersStatus.message}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div className="text-xs text-text-muted">
                {t("board.settingsOwnerLabel")}{" "}
                <span className="text-text-primary">
                  {currentOwner
                    ? resolveMemberName(currentOwner)
                    : t("board.ownerUnknown")}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
                <div className="space-y-2">
                  <Label htmlFor="board_transfer_owner">
                    {t("board.settingsTransferLabel")}
                  </Label>
                  <select
                    id="board_transfer_owner"
                    value={newOwnerId}
                    onChange={(event) => setNewOwnerId(event.target.value)}
                    disabled={!canTransferOwnership || isArchived || isMembersLoading}
                    className="h-10 w-full rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 disabled:opacity-60"
                  >
                    <option value="">
                      {t("board.settingsTransferPlaceholder")}
                    </option>
                    {transferOptions.map((member) => (
                      <option key={member.user.id} value={member.user.id}>
                        {resolveMemberName(member)} (
                        {t(`board.role${capitalize(member.role)}`)})
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleTransferOwnership}
                  disabled={
                    !canTransferOwnership ||
                    isArchived ||
                    isTransferring ||
                    isMembersLoading
                  }
                >
                  {isTransferring
                    ? t("board.settingsTransferring")
                    : t("board.settingsTransferAction")}
                </Button>
              </div>

              {isMembersLoading && (
                <div className="text-sm text-text-muted">
                  {t("board.settingsMembersLoading")}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 lg:col-span-2">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-text-primary">
                {t("board.settingsArchiveTitle")}
              </h3>
              <p className="text-sm text-text-secondary">
                {t("board.settingsArchiveSubtitle")}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {isArchived ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleUnarchive}
                  disabled={!canManageBoard || isArchiving}
                >
                  {isArchiving
                    ? t("board.settingsUnarchiving")
                    : t("board.settingsUnarchiveAction")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300"
                  onClick={handleArchive}
                  disabled={!canManageBoard || isArchiving}
                >
                  {isArchiving
                    ? t("board.settingsArchiving")
                    : t("board.settingsArchiveAction")}
                </Button>
              )}
              {!canManageBoard && (
                <span className="text-xs text-text-muted">
                  {t("board.settingsArchiveHint")}
                </span>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 lg:col-span-2">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-text-primary">
                {t("board.settingsDeleteTitle")}
              </h3>
              <p className="text-sm text-text-secondary">
                {t("board.settingsDeleteSubtitle")}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                className="text-red-400 hover:text-red-300"
                onClick={handleDeleteBoard}
                disabled={!canDeleteBoard || isDeleting}
              >
                {isDeleting
                  ? t("board.settingsDeleting")
                  : t("board.settingsDeleteAction")}
              </Button>
              {!canDeleteBoard && (
                <span className="text-xs text-text-muted">
                  {t("board.settingsDeleteHint")}
                </span>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function resolveMemberName(member: BoardMember) {
  return member.user.display_name || member.user.username || "Member";
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
