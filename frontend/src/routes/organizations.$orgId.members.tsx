import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  cancelOrganizationEmailInvite,
  getOrganizationUsage,
  inviteOrganizationMembers,
  listOrganizationEmailInvites,
  listOrganizationMembers,
  removeOrganizationMember,
  resendOrganizationEmailInvite,
  resendOrganizationInvite,
  updateOrganizationMemberRole,
} from "@/features/organizations/api";
import type {
  OrganizationEmailInvite,
  OrganizationMember,
  OrganizationRole,
  OrganizationUsage,
} from "@/features/organizations/types";
import { useOrganizationStore } from "@/features/organizations/state/useOrganizationStore";
import { useAppStore } from "@/store/useAppStore";
import { getApiErrorMessage } from "@/shared/api/errors";

type StatusMessage = {
  tone: "success" | "error";
  message: string;
};

type UsageCard = {
  key: "members" | "boards" | "storage";
  label: string;
  used: number;
  limit: number;
  warning: boolean;
  unit?: string;
  queued?: number;
};

export const Route = createFileRoute("/organizations/$orgId/members")({
  beforeLoad: async () => {
    const store = useAppStore.getState();
    const token = localStorage.getItem("token");
    if (!token) {
      throw redirect({
        to: "/login",
      });
    }

    await store.checkAuth();
    const latestState = useAppStore.getState();
    if (!latestState.isAuthenticated) {
      throw redirect({
        to: "/login",
      });
    }
    if (latestState.requiresEmailVerification) {
      throw redirect({
        to: "/register/setup",
      });
    }
  },
  component: OrganizationMembers,
});

function OrganizationMembers() {
  const { orgId } = Route.useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const user = useAppStore((state) => state.user);
  const loadOrganizations = useOrganizationStore((state) => state.loadOrganizations);
  const organizations = useOrganizationStore((state) => state.organizations);
  const currentOrganization = useOrganizationStore(
    (state) => state.currentOrganization,
  );
  const setCurrentOrganization = useOrganizationStore(
    (state) => state.setCurrentOrganization,
  );

  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [emailInvites, setEmailInvites] = useState<OrganizationEmailInvite[]>([]);
  const [usage, setUsage] = useState<OrganizationUsage | null>(null);
  const [usageStatus, setUsageStatus] = useState<StatusMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [emailInviteStatus, setEmailInviteStatus] = useState<StatusMessage | null>(
    null,
  );

  const [inviteInput, setInviteInput] = useState("");
  const [invitees, setInvitees] = useState<string[]>([]);
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("member");
  const [inviteStatus, setInviteStatus] = useState<StatusMessage | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  const [actionMemberId, setActionMemberId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"role" | "remove" | "resend" | null>(
    null,
  );
  const [emailInviteActionId, setEmailInviteActionId] = useState<string | null>(
    null,
  );
  const [emailInviteActionType, setEmailInviteActionType] = useState<
    "resend" | "cancel" | null
  >(null);

  const loadMembers = useCallback(async () => {
    setIsLoading(true);
    setStatus(null);
    setEmailInviteStatus(null);
    setUsageStatus(null);
    try {
      const data = await listOrganizationMembers(orgId);
      setMembers(data);
      const current = data.find((member) => member.user.id === user?.id);
      const isManager =
        current?.role === "owner" || current?.role === "admin";
      if (isManager) {
        const invites = await listOrganizationEmailInvites(orgId);
        setEmailInvites(invites);
      } else {
        setEmailInvites([]);
      }
      try {
        const usageData = await getOrganizationUsage(orgId);
        setUsage(usageData);
      } catch (error) {
        setUsage(null);
        setUsageStatus({
          tone: "error",
          message: getErrorMessage(error, t("org.usageLoadError")),
        });
      }
    } catch (error) {
      setEmailInvites([]);
      setUsage(null);
      setStatus({
        tone: "error",
        message: getErrorMessage(error, t("org.membersLoadError")),
      });
    } finally {
      setIsLoading(false);
    }
  }, [orgId, t, user?.id]);

  useEffect(() => {
    loadOrganizations().catch(() => undefined);
  }, [loadOrganizations]);

  useEffect(() => {
    const match = organizations.find((org) => org.id === orgId);
    if (match && match.id !== currentOrganization?.id) {
      setCurrentOrganization(match);
    }
  }, [currentOrganization?.id, organizations, orgId, setCurrentOrganization]);

  useEffect(() => {
    loadMembers().catch(() => undefined);
  }, [loadMembers]);

  const currentMember = members.find((member) => member.user.id === user?.id);
  const currentRole = currentMember?.role ?? currentOrganization?.role;
  const canManageMembers = currentRole === "owner" || currentRole === "admin";
  const canTransferOwnership = currentRole === "owner";
  const remainingMemberSlots =
    usage && usage.members_limit > 0
      ? Math.max(usage.members_limit - usage.members_used, 0)
      : null;
  const queuedInvites = getQueuedInviteCount(invitees, inviteInput);
  const inviteSlotsRemaining =
    remainingMemberSlots === null
      ? null
      : Math.max(remainingMemberSlots - invitees.length, 0);
  const memberLimitReached =
    inviteSlotsRemaining !== null ? inviteSlotsRemaining <= 0 : false;
  const canInvite = canManageMembers && !memberLimitReached;

  const roleOptions: OrganizationRole[] = useMemo(
    () => ["owner", "admin", "member", "guest"],
    [],
  );

  const usageCards: UsageCard[] = usage
    ? [
        {
          key: "members",
          label: t("org.usageMembers"),
          used: usage.members_used,
          limit: usage.members_limit,
          warning: usage.members_warning,
          queued: queuedInvites,
        },
        {
          key: "boards",
          label: t("org.usageBoards"),
          used: usage.boards_used,
          limit: usage.boards_limit,
          warning: usage.boards_warning,
          queued: 0,
        },
        {
          key: "storage",
          label: t("org.usageStorage"),
          used: usage.storage_used_mb,
          limit: usage.storage_limit_mb,
          warning: usage.storage_warning,
          unit: "mb",
          queued: 0,
        },
      ]
    : [];

  const usageWarningResources = usage
    ? [
        usage.members_warning ? t("org.usageMembers") : null,
        usage.boards_warning ? t("org.usageBoards") : null,
        usage.storage_warning ? t("org.usageStorage") : null,
      ].filter((value): value is string => Boolean(value))
    : [];

  const handleAddInvite = () => {
    setInviteStatus(null);
    if (!canInvite) {
      setInviteStatus({
        tone: "error",
        message: t("org.memberLimitReached"),
      });
      return;
    }
    const nextEmails = parseEmails(inviteInput);
    if (nextEmails.length === 0) return;

    const invalid = nextEmails.filter((email) => !isValidEmail(email));
    if (invalid.length > 0) {
      setInviteStatus({
        tone: "error",
        message: t("org.inviteErrorInvalid", {
          emails: invalid.join(", "),
        }),
      });
      return;
    }
    if (inviteSlotsRemaining !== null && nextEmails.length > inviteSlotsRemaining) {
      setInviteStatus({
        tone: "error",
        message: t("org.memberLimitRemaining", {
          count: inviteSlotsRemaining,
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
          message: t("org.inviteErrorDuplicate", {
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
        message: t("org.inviteErrorInvalid", {
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
    if (!canInvite) {
      setInviteStatus({
        tone: "error",
        message: t("org.memberLimitReached"),
      });
      return;
    }
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
          message: t("org.inviteEmpty"),
        });
        return;
      }
      if (remainingMemberSlots !== null && targets.length > remainingMemberSlots) {
        setInviteStatus({
          tone: "error",
          message: t("org.memberLimitRemaining", {
            count: remainingMemberSlots,
          }),
        });
        return;
      }
      await inviteOrganizationMembers(orgId, {
        emails: targets,
        role: inviteRole,
      });
      setInvitees([]);
      setInviteInput("");
      setInviteStatus({
        tone: "success",
        message: t("org.inviteSent"),
      });
      await loadMembers();
    } catch (error) {
      setInviteStatus({
        tone: "error",
        message: getErrorMessage(error, t("org.inviteSendError")),
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, role: OrganizationRole) => {
    if (!canManageMembers) return;
    setStatus(null);
    setActionMemberId(memberId);
    setActionType("role");
    try {
      await updateOrganizationMemberRole(orgId, memberId, { role });
      await loadMembers();
      setStatus({
        tone: "success",
        message: t("org.memberRoleUpdated"),
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getErrorMessage(error, t("org.memberRoleUpdateError")),
      });
    } finally {
      setActionMemberId(null);
      setActionType(null);
    }
  };

  const handleRemove = async (member: OrganizationMember) => {
    if (!canManageMembers) return;
    if (member.user.id === user?.id) return;
    const confirmed = window.confirm(t("org.memberRemoveConfirm"));
    if (!confirmed) return;
    setStatus(null);
    setActionMemberId(member.id);
    setActionType("remove");
    try {
      await removeOrganizationMember(orgId, member.id);
      await loadMembers();
      setStatus({
        tone: "success",
        message: t("org.memberRemoved"),
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getErrorMessage(error, t("org.memberRemoveError")),
      });
    } finally {
      setActionMemberId(null);
      setActionType(null);
    }
  };

  const handleResend = async (member: OrganizationMember) => {
    if (!canManageMembers) return;
    setStatus(null);
    setActionMemberId(member.id);
    setActionType("resend");
    try {
      await resendOrganizationInvite(orgId, member.id);
      await loadMembers();
      setStatus({
        tone: "success",
        message: t("org.inviteResent"),
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getErrorMessage(error, t("org.inviteResendError")),
      });
    } finally {
      setActionMemberId(null);
      setActionType(null);
    }
  };

  const handleResendEmailInvite = async (invite: OrganizationEmailInvite) => {
    if (!canManageMembers) return;
    setEmailInviteStatus(null);
    setEmailInviteActionId(invite.id);
    setEmailInviteActionType("resend");
    try {
      await resendOrganizationEmailInvite(orgId, invite.id);
      await loadMembers();
      setEmailInviteStatus({
        tone: "success",
        message: t("org.emailInviteResent"),
      });
    } catch (error) {
      setEmailInviteStatus({
        tone: "error",
        message: getErrorMessage(error, t("org.emailInviteResendError")),
      });
    } finally {
      setEmailInviteActionId(null);
      setEmailInviteActionType(null);
    }
  };

  const handleCancelEmailInvite = async (invite: OrganizationEmailInvite) => {
    if (!canManageMembers) return;
    const confirmed = window.confirm(t("org.emailInviteCancelConfirm"));
    if (!confirmed) return;
    setEmailInviteStatus(null);
    setEmailInviteActionId(invite.id);
    setEmailInviteActionType("cancel");
    try {
      await cancelOrganizationEmailInvite(orgId, invite.id);
      await loadMembers();
      setEmailInviteStatus({
        tone: "success",
        message: t("org.emailInviteCanceled"),
      });
    } catch (error) {
      setEmailInviteStatus({
        tone: "error",
        message: getErrorMessage(error, t("org.emailInviteCancelError")),
      });
    } finally {
      setEmailInviteActionId(null);
      setEmailInviteActionType(null);
    }
  };

  const pageTitle = currentOrganization?.name ?? t("org.personalWorkspace");

  return (
    <div className="flex h-screen bg-bg-base text-text-primary font-body overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />

        <main className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 max-w-[1400px] mx-auto w-full flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => navigate({ to: "/dashboard" })}
                className="text-xs uppercase tracking-widest text-text-muted hover:text-text-primary w-fit"
              >
                {t("org.backToDashboard")}
              </button>
              <h1 className="text-3xl font-bold text-text-primary font-heading">
                {t("org.membersTitle")}
              </h1>
              <p className="text-text-secondary">
                {t("org.membersSubtitle", { name: pageTitle })}
              </p>
            </div>

            {(usage || usageStatus) && (
              <section className="rounded-2xl border border-border bg-surface p-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-text-primary">
                    {t("org.usageTitle")}
                  </h2>
                  <p className="text-sm text-text-secondary">
                    {t("org.usageSubtitle")}
                  </p>
                </div>

                {usageStatus && (
                  <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                    {usageStatus.message}
                  </div>
                )}

                {usage && (
                  <>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      {usageCards.map((item) => {
                        const percent = getUsagePercent(item.used, item.limit);
                        return (
                          <div
                            key={item.key}
                            className="rounded-xl border border-border bg-bg-base p-4"
                          >
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-text-secondary">
                                {item.label}
                              </span>
                              <span
                                className={
                                  item.warning
                                    ? "text-yellow-400 font-medium"
                                    : "text-text-muted"
                                }
                              >
                                {formatUsageLabel(
                                  item.used,
                                  item.limit,
                                  item.unit,
                                  item.queued,
                                  t,
                                )}
                              </span>
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-border/60">
                              <div
                                className={
                                  item.warning
                                    ? "h-full rounded-full bg-yellow-400"
                                    : "h-full rounded-full bg-text-secondary/70"
                                }
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {usageWarningResources.length > 0 && (
                      <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
                        {t("org.usageWarning", {
                          resources: usageWarningResources.join(", "),
                        })}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-border bg-surface p-6">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-text-primary">
                  {t("org.inviteMembersTitle")}
                </h2>
                <p className="text-sm text-text-secondary">
                  {t("org.inviteMembersSubtitle")}
                </p>
              </div>

              {memberLimitReached && (
                <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
                  {t("org.memberLimitReached")}
                </div>
              )}
              {!memberLimitReached && inviteSlotsRemaining !== null && (
                <div className="mt-3 text-xs text-text-muted">
                  {t("org.memberLimitRemaining", { count: inviteSlotsRemaining })}
                </div>
              )}

              {inviteStatus && (
                <div
                  className={
                    inviteStatus.tone === "success"
                      ? "mt-4 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
                      : "mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
                  }
                >
                  {inviteStatus.message}
                </div>
              )}

              <form onSubmit={handleInviteSubmit} className="mt-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr_auto] items-end">
                  <div className="space-y-2">
                    <Label htmlFor="member_invite">{t("org.inviteEmailLabel")}</Label>
                    <Input
                      id="member_invite"
                      value={inviteInput}
                      onChange={(event) => setInviteInput(event.target.value)}
                      onKeyDown={handleInviteKey}
                      placeholder={t("org.inviteEmailPlaceholder")}
                      className="h-10 bg-bg-base border-border"
                      disabled={!canInvite}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="member_role">{t("org.inviteRoleLabel")}</Label>
                    <select
                      id="member_role"
                      value={inviteRole}
                      onChange={(event) =>
                        setInviteRole(event.target.value as OrganizationRole)
                      }
                      className="h-10 w-full rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50"
                      disabled={!canInvite}
                    >
                      <option value="member">{t("org.roleMember")}</option>
                      <option value="admin">{t("org.roleAdmin")}</option>
                      <option value="guest">{t("org.roleGuest")}</option>
                    </select>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-10"
                    onClick={handleAddInvite}
                    disabled={!canInvite}
                  >
                    {t("org.inviteAdd")}
                  </Button>
                </div>

                {invitees.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-text-primary">
                      {t("org.inviteListLabel")}
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
                              setInvitees((prev) => prev.filter((item) => item !== email))
                            }
                            className="text-text-muted hover:text-text-primary"
                          >
                            ×
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
                    disabled={!canInvite || isInviting}
                  >
                    {isInviting ? t("org.inviteSending") : t("org.inviteSend")}
                  </Button>
                </div>
              </form>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">
                    {t("org.membersListTitle")}
                  </h2>
                  <p className="text-sm text-text-secondary">
                    {t("org.membersListSubtitle")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => loadMembers()}
                  className="text-text-secondary hover:text-text-primary"
                >
                  {t("org.refresh")}
                </Button>
              </div>

              {status && (
                <div
                  className={
                    status.tone === "success"
                      ? "mt-4 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
                      : "mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
                  }
                >
                  {status.message}
                </div>
              )}

              <div className="mt-6 space-y-3">
                {isLoading ? (
                  <div className="text-sm text-text-muted">
                    {t("org.membersLoading")}
                  </div>
                ) : members.length === 0 ? (
                  <div className="text-sm text-text-muted">
                    {t("org.membersEmpty")}
                  </div>
                ) : (
                  members.map((member) => {
                    const isSelf = member.user.id === user?.id;
                    const isOwner = member.role === "owner";
                    const showResend =
                      !!member.invited_at && !member.accepted_at && canManageMembers;
                    const isBusy = actionMemberId === member.id;
                    const canEditRole =
                      canManageMembers && (!isOwner || currentRole === "owner");

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
                                {isSelf ? ` (${t("org.memberYou")})` : ""}
                              </span>
                              <span className="text-xs text-text-muted">
                                {member.user.username || t("org.memberNoUsername")}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-text-muted">
                                {t("org.memberRoleLabel")}
                              </span>
                              <select
                                value={member.role}
                                onChange={(event) =>
                                  handleRoleChange(
                                    member.id,
                                    event.target.value as OrganizationRole,
                                  )
                                }
                                className="h-9 rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 disabled:opacity-60"
                                disabled={!canEditRole || (isBusy && actionType === "role")}
                              >
                                {roleOptions.map((role) => (
                                  <option
                                    key={role}
                                    value={role}
                                    disabled={role === "owner" && !canTransferOwnership}
                                  >
                                    {t(`org.role${capitalize(role)}`)}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-text-muted">
                                {t("org.memberStatusLabel")}
                              </span>
                              <span className="text-sm text-text-secondary">
                                {getMemberStatus(member, i18n.language, t)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {showResend && (
                                <Button
                                  variant="ghost"
                                  className="text-text-secondary hover:text-text-primary"
                                  onClick={() => handleResend(member)}
                                  disabled={isBusy && actionType === "resend"}
                                >
                                  {t("org.inviteResend")}
                                </Button>
                              )}
                              {canManageMembers && !isSelf && (
                                <Button
                                  variant="ghost"
                                  className="text-red-400 hover:text-red-300"
                                  onClick={() => handleRemove(member)}
                                  disabled={isBusy && actionType === "remove"}
                                >
                                  {t("org.memberRemove")}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {!isLoading && emailInvites.length > 0 && (
                <div className="mt-6 space-y-3">
                  <div className="text-sm font-medium text-text-primary">
                    {t("org.emailInvitesTitle")}
                  </div>
                  <div className="text-sm text-text-secondary">
                    {t("org.emailInvitesSubtitle")}
                  </div>
                  {emailInviteStatus && (
                    <div
                      className={
                        emailInviteStatus.tone === "success"
                          ? "rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
                          : "rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
                      }
                    >
                      {emailInviteStatus.message}
                    </div>
                  )}
                  <div className="space-y-3">
                    {emailInvites.map((invite) => (
                      <div
                        key={invite.id}
                        className="rounded-xl border border-border bg-bg-base px-4 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <div className="text-sm font-medium text-text-primary">
                            {invite.email}
                          </div>
                          <div className="text-xs text-text-muted">
                            {t("org.invitationRole")}{" "}
                            <span className="font-medium text-text-primary">
                              {t(`org.role${capitalize(invite.role)}`)}
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-text-muted text-right space-y-2">
                          <div>
                            {t("org.invitationInvitedAt", {
                              date: formatInviteDate(
                                invite.invited_at,
                                i18n.language,
                                t,
                              ),
                            })}
                          </div>
                          {invite.invite_expires_at && (
                            <div>
                              {t("org.emailInviteExpiresAt", {
                                date: formatInviteDate(
                                  invite.invite_expires_at,
                                  i18n.language,
                                  t,
                                ),
                              })}
                            </div>
                          )}
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              className="text-text-secondary hover:text-text-primary"
                              onClick={() => handleResendEmailInvite(invite)}
                              disabled={
                                emailInviteActionId === invite.id &&
                                emailInviteActionType === "resend"
                              }
                            >
                              {t("org.emailInviteResend")}
                            </Button>
                            <Button
                              variant="ghost"
                              className="text-red-400 hover:text-red-300"
                              onClick={() => handleCancelEmailInvite(invite)}
                              disabled={
                                emailInviteActionId === invite.id &&
                                emailInviteActionType === "cancel"
                              }
                            >
                              {t("org.emailInviteCancel")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
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

function getMemberName(member: OrganizationMember) {
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

function getMemberStatus(
  member: OrganizationMember,
  language: string,
  t: (key: string, options?: Record<string, string>) => string,
) {
  if (member.accepted_at) {
    return t("org.memberStatusActive");
  }
  if (!member.invited_at) {
    return t("org.memberStatusPending");
  }
  const date = new Date(member.invited_at);
  if (Number.isNaN(date.getTime())) {
    return t("org.memberStatusInvited");
  }
  const formatted = new Intl.DateTimeFormat(language).format(date);
  return t("org.memberStatusInvitedAt", { date: formatted });
}

function formatInviteDate(
  value: string | null | undefined,
  language: string,
  t: (key: string, options?: Record<string, string>) => string,
) {
  if (!value) {
    return t("org.invitationNoDate");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("org.invitationNoDate");
  }
  return new Intl.DateTimeFormat(language).format(date);
}

function isLimitReached(used: number, limit: number) {
  if (limit <= 0) {
    return false;
  }

  return used >= limit;
}

function getUsagePercent(used: number, limit: number) {
  if (limit <= 0) {
    return 0;
  }

  const percent = Math.round((used / limit) * 100);
  return Math.min(100, Math.max(0, percent));
}

function formatUsageLabel(
  used: number,
  limit: number,
  unit: string | undefined,
  queued: number | undefined,
  t: (key: string, options?: Record<string, string>) => string,
) {
  const usedLabel = formatUsageValue(used, unit);
  if (queued && queued > 0) {
    if (limit <= 0) {
      return t("org.usageUnlimitedQueued", { used: usedLabel, queued: queued.toString() });
    }

    const limitLabel = formatUsageValue(limit, unit);
    return t("org.usageLimitQueued", {
      used: usedLabel,
      limit: limitLabel,
      queued: queued.toString(),
    });
  }
  if (limit <= 0) {
    return t("org.usageUnlimited", { used: usedLabel });
  }

  const limitLabel = formatUsageValue(limit, unit);
  return t("org.usageLimit", { used: usedLabel, limit: limitLabel });
}

function formatUsageValue(value: number, unit: string | undefined) {
  if (unit === "mb") {
    return formatStorage(value);
  }

  return value.toString();
}

function formatStorage(value: number) {
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} GB`;
  }

  return `${value} MB`;
}

function getQueuedInviteCount(invitees: string[], inviteInput: string) {
  if (invitees.length === 0 && inviteInput.trim().length === 0) {
    return 0;
  }

  const unique = new Set(invitees);
  for (const email of parseEmails(inviteInput)) {
    unique.add(email);
  }

  return unique.size;
}

function getErrorMessage(error: unknown, fallback: string) {
  return getApiErrorMessage(error, fallback);
}
