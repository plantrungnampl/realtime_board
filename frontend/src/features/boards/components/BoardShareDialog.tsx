import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Share2 } from "lucide-react";

import {
  inviteBoardMembers,
  listBoardMembers,
  removeBoardMember,
  updateBoardMemberRole,
} from "@/features/boards/api";
import {
  buildPermissionOverrides,
  hasCustomPermissionOverrides,
  resolveEffectivePermissions,
} from "@/features/boards/permissions";
import type {
  BoardMember,
  BoardPermissions,
  BoardRole,
} from "@/features/boards/types";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getApiErrorMessage } from "@/shared/api/errors";

interface BoardShareDialogProps {
  boardId: string;
}

type StatusMessage = {
  tone: "success" | "error";
  message: string;
};

export function BoardShareDialog({ boardId }: BoardShareDialogProps) {
  const { t } = useTranslation();
  const user = useAppStore((state) => state.user);

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const [inviteInput, setInviteInput] = useState("");
  const [invitees, setInvitees] = useState<string[]>([]);
  const [inviteRole, setInviteRole] = useState<BoardRole>("viewer");
  const [inviteStatus, setInviteStatus] = useState<StatusMessage | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  const [actionMemberId, setActionMemberId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"role" | "remove" | "permissions" | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [permissionDrafts, setPermissionDrafts] = useState<
    Record<string, BoardPermissions>
  >({});

  const currentMember = members.find((member) => member.user.id === user?.id);
  const currentRole = currentMember?.role;
  const currentPermissions = currentMember
    ? resolveEffectivePermissions(
        currentMember.role,
        currentMember.custom_permissions,
        currentMember.effective_permissions ?? null,
      )
    : null;
  const canManageMembers = currentPermissions?.canManageMembers
    ?? (currentRole === "owner" || currentRole === "admin");
  const canAssignOwner = currentRole === "owner";

  const roleOptions = useMemo<BoardRole[]>(
    () => ["owner", "admin", "editor", "commenter", "viewer"],
    [],
  );

  const permissionOptions = useMemo<
    Array<{ key: keyof BoardPermissions; label: string }>
  >(
    () => [
      { key: "canView", label: t("board.permissionView") },
      { key: "canEdit", label: t("board.permissionEdit") },
      { key: "canComment", label: t("board.permissionComment") },
      { key: "canManageMembers", label: t("board.permissionManageMembers") },
      { key: "canManageBoard", label: t("board.permissionManageBoard") },
    ],
    [t],
  );

  const inviteRoleOptions = useMemo<BoardRole[]>(() => {
    if (canAssignOwner) {
      return roleOptions;
    }
    return roleOptions.filter((role) => role !== "owner");
  }, [canAssignOwner, roleOptions]);

  const loadMembers = useCallback(async () => {
    setIsLoading(true);
    setStatus(null);
    try {
      const data = await listBoardMembers(boardId);
      setMembers(data);
      setExpandedMemberId(null);
      setPermissionDrafts({});
    } catch (error) {
      setMembers([]);
      setStatus({
        tone: "error",
        message: getErrorMessage(error, t("board.membersLoadError")),
      });
    } finally {
      setIsLoading(false);
    }
  }, [boardId, t]);

  useEffect(() => {
    if (!isOpen) return;
    loadMembers().catch(() => undefined);
  }, [isOpen, loadMembers]);

  useEffect(() => {
    if (!canAssignOwner && inviteRole === "owner") {
      setInviteRole("viewer");
    }
  }, [canAssignOwner, inviteRole]);

  const handleAddInvite = () => {
    setInviteStatus(null);
    const nextEmails = parseEmails(inviteInput);
    if (nextEmails.length === 0) return;

    const invalid = nextEmails.filter((email) => !isValidEmail(email));
    if (invalid.length > 0) {
      setInviteStatus({
        tone: "error",
        message: t("board.inviteErrorInvalid", {
          emails: invalid.join(", "),
        }),
      });
      return;
    }

    setInvitees((prev) => {
      const existing = new Set(prev);
      const duplicates = nextEmails.filter((email) => existing.has(email));
      if (duplicates.length > 0) {
        setInviteStatus({
          tone: "error",
          message: t("board.inviteErrorDuplicate", {
            emails: duplicates.join(", "),
          }),
        });
      }
      const additions = nextEmails.filter((email) => !existing.has(email));
      return [...prev, ...additions];
    });
    setInviteInput("");
  };

  const handleInviteKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      handleAddInvite();
    }
  };

  const buildInviteList = () => {
    const pending = parseEmails(inviteInput);
    if (pending.length === 0) {
      return invitees;
    }
    const invalid = pending.filter((email) => !isValidEmail(email));
    if (invalid.length > 0) {
      setInviteStatus({
        tone: "error",
        message: t("board.inviteErrorInvalid", {
          emails: invalid.join(", "),
        }),
      });
      return null;
    }
    const existing = new Set(invitees);
    const additions = pending.filter((email) => !existing.has(email));
    const merged = additions.length > 0 ? [...invitees, ...additions] : invitees;
    if (additions.length > 0) {
      setInvitees(merged);
    }
    setInviteInput("");
    return merged;
  };

  const handleInviteSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageMembers) return;
    setInviteStatus(null);
    setIsInviting(true);

    try {
      const targets = buildInviteList();
      if (!targets) {
        return;
      }
      if (targets.length === 0) {
        setInviteStatus({
          tone: "error",
          message: t("board.inviteEmpty"),
        });
        return;
      }
      await inviteBoardMembers(boardId, {
        emails: targets,
        role: inviteRole,
      });
      setInvitees([]);
      setInviteInput("");
      setInviteStatus({
        tone: "success",
        message: t("board.inviteSent"),
      });
      await loadMembers();
    } catch (error) {
      setInviteStatus({
        tone: "error",
        message: getErrorMessage(error, t("board.inviteSendError")),
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, role: BoardRole) => {
    if (!canManageMembers) return;
    setStatus(null);
    setActionMemberId(memberId);
    setActionType("role");
    try {
      await updateBoardMemberRole(boardId, memberId, { role });
      await loadMembers();
      setStatus({
        tone: "success",
        message: t("board.memberRoleUpdated"),
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getErrorMessage(error, t("board.memberRoleUpdateError")),
      });
    } finally {
      setActionMemberId(null);
      setActionType(null);
    }
  };

  const togglePermissionsEditor = (
    member: BoardMember,
    effectivePermissions: BoardPermissions,
  ) => {
    if (!canManageMembers) return;
    setExpandedMemberId((prev) => (prev === member.id ? null : member.id));
    setPermissionDrafts((prev) => {
      if (prev[member.id]) {
        return prev;
      }
      return {
        ...prev,
        [member.id]: effectivePermissions,
      };
    });
  };

  const updatePermissionDraft = (
    memberId: string,
    key: keyof BoardPermissions,
    value: boolean,
    fallback: BoardPermissions,
  ) => {
    setPermissionDrafts((prev) => ({
      ...prev,
      [memberId]: {
        ...(prev[memberId] ?? fallback),
        [key]: value,
      },
    }));
  };

  const handleSavePermissions = async (
    member: BoardMember,
    permissions: BoardPermissions,
  ) => {
    if (!canManageMembers) return;
    setStatus(null);
    setActionMemberId(member.id);
    setActionType("permissions");
    try {
      await updateBoardMemberRole(boardId, member.id, {
        role: member.role,
        custom_permissions: buildPermissionOverrides(permissions),
      });
      await loadMembers();
      setStatus({
        tone: "success",
        message: t("board.memberPermissionsUpdated"),
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getErrorMessage(error, t("board.memberPermissionsUpdateError")),
      });
    } finally {
      setActionMemberId(null);
      setActionType(null);
    }
  };

  const handleResetPermissions = async (member: BoardMember) => {
    if (!canManageMembers) return;
    setStatus(null);
    setActionMemberId(member.id);
    setActionType("permissions");
    try {
      await updateBoardMemberRole(boardId, member.id, {
        role: member.role,
        custom_permissions: {},
      });
      await loadMembers();
      setStatus({
        tone: "success",
        message: t("board.memberPermissionsReset"),
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getErrorMessage(error, t("board.memberPermissionsUpdateError")),
      });
    } finally {
      setActionMemberId(null);
      setActionType(null);
    }
  };

  const handleRemove = async (member: BoardMember) => {
    if (!canManageMembers) return;
    if (member.user.id === user?.id) return;
    const confirmed = window.confirm(t("board.memberRemoveConfirm"));
    if (!confirmed) return;
    setStatus(null);
    setActionMemberId(member.id);
    setActionType("remove");
    try {
      await removeBoardMember(boardId, member.id);
      await loadMembers();
      setStatus({
        tone: "success",
        message: t("board.memberRemoved"),
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getErrorMessage(error, t("board.memberRemoveError")),
      });
    } finally {
      setActionMemberId(null);
      setActionType(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Share2 className="w-4 h-4" />
          {t("board.share")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("board.shareTitle")}</DialogTitle>
          <DialogDescription>{t("board.shareSubtitle")}</DialogDescription>
        </DialogHeader>

        <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-text-primary">
              {t("board.inviteMembersTitle")}
            </h3>
            <p className="text-sm text-text-secondary">
              {t("board.inviteMembersSubtitle")}
            </p>
            <p className="text-xs text-text-muted">
              {t("board.inviteNoteExisting")} {t("board.inviteNoteWorkspace")}
            </p>
          </div>

          {inviteStatus && (
            <div
              className={
                inviteStatus.tone === "success"
                  ? "mt-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
                  : "mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
              }
            >
              {inviteStatus.message}
            </div>
          )}

          <form onSubmit={handleInviteSubmit} className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr_auto] items-end">
              <div className="space-y-2">
                <Label htmlFor="board_member_invite">
                  {t("board.inviteEmailLabel")}
                </Label>
                <Input
                  id="board_member_invite"
                  value={inviteInput}
                  onChange={(event) => setInviteInput(event.target.value)}
                  onKeyDown={handleInviteKey}
                  placeholder={t("board.inviteEmailPlaceholder")}
                  className="h-10 bg-bg-base border-border"
                  disabled={!canManageMembers}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="board_member_role">
                  {t("board.inviteRoleLabel")}
                </Label>
                <select
                  id="board_member_role"
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(event.target.value as BoardRole)
                  }
                  className="h-10 w-full rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50"
                  disabled={!canManageMembers}
                >
                  {inviteRoleOptions.map((role) => (
                    <option key={role} value={role}>
                      {t(`board.role${capitalize(role)}`)}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-10"
                onClick={handleAddInvite}
                disabled={!canManageMembers}
              >
                {t("board.inviteAdd")}
              </Button>
            </div>

            <p className="text-xs text-text-muted">
              {t("board.inviteNoteExisting")}
            </p>

            {invitees.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-text-primary">
                  {t("board.inviteListLabel")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {invitees.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-base px-3 py-1 text-xs text-text-primary"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() =>
                          setInvitees((prev) =>
                            prev.filter((item) => item !== email),
                          )
                        }
                        className="text-text-muted hover:text-text-primary"
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                className="min-w-[180px]"
                disabled={!canManageMembers || isInviting}
              >
                {isInviting ? t("board.inviteSending") : t("board.inviteSend")}
              </Button>
            </div>
          </form>
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-text-primary">
                {t("board.membersTitle")}
              </h3>
              <p className="text-sm text-text-secondary">
                {t("board.membersSubtitle")}
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => loadMembers()}
              className="text-text-secondary hover:text-text-primary"
            >
              {t("board.refresh")}
            </Button>
          </div>

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

          <div className="mt-4 space-y-3">
            {isLoading ? (
              <div className="text-sm text-text-muted">
                {t("board.membersLoading")}
              </div>
            ) : members.length === 0 ? (
              <div className="text-sm text-text-muted">
                {t("board.membersEmpty")}
              </div>
            ) : (
              members.map((member) => {
                const isSelf = member.user.id === user?.id;
                const isOwner = member.role === "owner";
                const isBusy = actionMemberId === member.id;
                const effectivePermissions = resolveEffectivePermissions(
                  member.role,
                  member.custom_permissions,
                  member.effective_permissions ?? null,
                );
                const canEditRole =
                  canManageMembers && (!isOwner || canAssignOwner) && !isSelf;
                const canRemove =
                  canManageMembers && !isSelf && (!isOwner || canAssignOwner);
                const canEditPermissions = canEditRole;
                const hasOverrides = hasCustomPermissionOverrides(
                  member.custom_permissions,
                );
                const canResetPermissions = canEditPermissions && hasOverrides;
                const isExpanded = expandedMemberId === member.id;
                const draftPermissions =
                  permissionDrafts[member.id] ?? effectivePermissions;

                return (
                  <div
                    key={member.id}
                    className="rounded-xl border border-border bg-bg-base px-4 py-4"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border border-border">
                          <AvatarImage
                            src={member.user.avatar_url ?? ""}
                            alt={member.user.display_name}
                          />
                          <AvatarFallback className="bg-bg-surface text-text-primary">
                            {getInitials(getMemberName(member))}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-text-primary">
                            {getMemberName(member)}
                            {isSelf ? ` (${t("board.memberYou")})` : ""}
                          </span>
                          <span className="text-xs text-text-muted">
                            {member.user.username || t("board.memberNoUsername")}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-text-muted">
                            {t("board.memberRoleLabel")}
                          </span>
                          <select
                            value={member.role}
                            onChange={(event) =>
                              handleRoleChange(
                                member.id,
                                event.target.value as BoardRole,
                              )
                            }
                            className="h-9 rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 disabled:opacity-60"
                            disabled={!canEditRole || (isBusy && actionType === "role")}
                          >
                            {roleOptions.map((role) => (
                              <option
                                key={role}
                                value={role}
                                disabled={role === "owner" && !canAssignOwner}
                              >
                                {t(`board.role${capitalize(role)}`)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {canRemove && (
                          <Button
                            variant="ghost"
                            className="text-red-400 hover:text-red-300"
                            onClick={() => handleRemove(member)}
                            disabled={isBusy && actionType === "remove"}
                          >
                            {t("board.memberRemove")}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg border border-border/60 bg-bg-surface/50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-text-secondary">
                          {t("board.memberPermissionsLabel")}
                        </div>
                        {hasOverrides && (
                          <span className="rounded-full border border-border bg-bg-base px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                            {t("board.memberPermissionsCustom")}
                          </span>
                        )}
                        {canEditPermissions && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() =>
                              togglePermissionsEditor(
                                member,
                                effectivePermissions,
                              )
                            }
                            disabled={isBusy && actionType === "permissions"}
                          >
                            {isExpanded
                              ? t("board.permissionsHide")
                              : t("board.permissionsCustomize")}
                          </Button>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {permissionOptions.map((option) => {
                          const allowed = effectivePermissions[option.key];
                          return (
                            <span
                              key={option.key}
                              className={
                                allowed
                                  ? "rounded-full border border-border bg-bg-base px-2 py-1 text-[11px] text-text-primary"
                                  : "rounded-full border border-border/60 bg-bg-surface px-2 py-1 text-[11px] text-text-muted"
                              }
                            >
                              {option.label}
                            </span>
                          );
                        })}
                      </div>

                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            {permissionOptions.map((option) => (
                              <label
                                key={option.key}
                                className="flex items-center justify-between rounded-md border border-border bg-bg-base px-3 py-2 text-xs text-text-secondary"
                              >
                                <span>{option.label}</span>
                                <input
                                  type="checkbox"
                                  checked={draftPermissions[option.key]}
                                  onChange={(event) =>
                                    updatePermissionDraft(
                                      member.id,
                                      option.key,
                                      event.target.checked,
                                      effectivePermissions,
                                    )
                                  }
                                  className="h-4 w-4 accent-yellow-500"
                                  disabled={
                                    !canEditPermissions
                                    || (isBusy && actionType === "permissions")
                                  }
                                />
                              </label>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResetPermissions(member)}
                              disabled={
                                !canResetPermissions
                                || (isBusy && actionType === "permissions")
                              }
                            >
                              {t("board.permissionsReset")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                handleSavePermissions(
                                  member,
                                  draftPermissions,
                                )
                              }
                              disabled={
                                !canEditPermissions
                                || (isBusy && actionType === "permissions")
                              }
                            >
                              {t("board.permissionsSave")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function parseEmails(value: string) {
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getMemberName(member: BoardMember) {
  return member.user.display_name || member.user.username || "Member";
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "MB";
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("") || "MB";
}

function capitalize(value: string) {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getErrorMessage(error: unknown, fallback: string) {
  return getApiErrorMessage(error, fallback);
}
