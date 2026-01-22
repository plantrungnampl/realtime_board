import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import {
  getOrganizationUsage,
  listOrganizationEmailInvites,
  listOrganizationMembers,
} from "@/features/organizations/api";
import { InviteMembersCard } from "@/features/organizations/components/InviteMembersCard";
import { MemberList } from "@/features/organizations/components/MemberList";
import { UsageHeader } from "@/features/organizations/components/UsageHeader";
import { useOrganizationMemberMutations } from "@/features/organizations/hooks/useOrganizationMemberMutations";
import {
  useInviteMembersMutation,
  useOrganizationEmailInviteMutations,
} from "@/features/organizations/hooks/useOrganizationInviteMutations";
import type { StatusMessage } from "@/features/organizations/organizationMembers.types";
import type {
  OrganizationEmailInvite,
  OrganizationMember,
  OrganizationRole,
  OrganizationUsage,
} from "@/features/organizations/types";
import { useOrganizationStore } from "@/features/organizations/state/useOrganizationStore";
import { useAppStore } from "@/store/useAppStore";
import { getApiErrorMessage } from "@/shared/api/errors";

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
  const { t } = useTranslation();
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

  const { actionMemberId, actionType, updateRole, removeMember, resendInvite } =
    useOrganizationMemberMutations(orgId);
  const {
    emailInviteActionId,
    emailInviteActionType,
    resendEmailInvite,
    cancelEmailInvite,
  } = useOrganizationEmailInviteMutations(orgId);
  const { isInviting, sendInvites } = useInviteMembersMutation(orgId);

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

  const roleOptions: OrganizationRole[] = ["owner", "admin", "member", "guest"];

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
      await sendInvites({
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
    }
  };

  const handleRoleChange = async (memberId: string, role: OrganizationRole) => {
    if (!canManageMembers) return;
    setStatus(null);
    try {
      await updateRole(memberId, role);
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
    }
  };

  const handleRemove = async (member: OrganizationMember) => {
    if (!canManageMembers) return;
    if (member.user.id === user?.id) return;
    const confirmed = window.confirm(t("org.memberRemoveConfirm"));
    if (!confirmed) return;
    setStatus(null);
    try {
      await removeMember(member.id);
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
    }
  };

  const handleResend = async (member: OrganizationMember) => {
    if (!canManageMembers) return;
    setStatus(null);
    try {
      await resendInvite(member.id);
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
    }
  };

  const handleResendEmailInvite = async (invite: OrganizationEmailInvite) => {
    if (!canManageMembers) return;
    setEmailInviteStatus(null);
    try {
      await resendEmailInvite(invite.id);
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
    }
  };

  const handleCancelEmailInvite = async (invite: OrganizationEmailInvite) => {
    if (!canManageMembers) return;
    const confirmed = window.confirm(t("org.emailInviteCancelConfirm"));
    if (!confirmed) return;
    setEmailInviteStatus(null);
    try {
      await cancelEmailInvite(invite.id);
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

            <UsageHeader
              usage={usage}
              status={usageStatus}
              queuedInvites={queuedInvites}
            />

            <InviteMembersCard
              inviteInput={inviteInput}
              invitees={invitees}
              inviteRole={inviteRole}
              inviteStatus={inviteStatus}
              isInviting={isInviting}
              canInvite={canInvite}
              memberLimitReached={memberLimitReached}
              inviteSlotsRemaining={inviteSlotsRemaining}
              onInviteInputChange={setInviteInput}
              onInviteInputKeyDown={handleInviteKey}
              onInviteRoleChange={setInviteRole}
              onInviteAdd={handleAddInvite}
              onInviteRemove={(email) =>
                setInvitees((prev) => prev.filter((item) => item !== email))
              }
              onInviteSubmit={handleInviteSubmit}
            />

            <MemberList
              members={members}
              emailInvites={emailInvites}
              isLoading={isLoading}
              status={status}
              emailInviteStatus={emailInviteStatus}
              actionMemberId={actionMemberId}
              actionType={actionType}
              emailInviteActionId={emailInviteActionId}
              emailInviteActionType={emailInviteActionType}
              currentRole={currentRole}
              canManageMembers={canManageMembers}
              canTransferOwnership={canTransferOwnership}
              roleOptions={roleOptions}
              currentUserId={user?.id}
              onRefresh={loadMembers}
              onRoleChange={handleRoleChange}
              onRemove={handleRemove}
              onResend={handleResend}
              onResendEmailInvite={handleResendEmailInvite}
              onCancelEmailInvite={handleCancelEmailInvite}
            />
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
