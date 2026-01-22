import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type {
  EmailInviteActionType,
  MemberActionType,
  StatusMessage,
} from "@/features/organizations/organizationMembers.types";
import type {
  OrganizationEmailInvite,
  OrganizationMember,
  OrganizationRole,
} from "@/features/organizations/types";

type MemberListProps = {
  members: OrganizationMember[];
  emailInvites: OrganizationEmailInvite[];
  isLoading: boolean;
  status: StatusMessage | null;
  emailInviteStatus: StatusMessage | null;
  actionMemberId: string | null;
  actionType: MemberActionType;
  emailInviteActionId: string | null;
  emailInviteActionType: EmailInviteActionType;
  currentRole: OrganizationRole | undefined;
  canManageMembers: boolean;
  canTransferOwnership: boolean;
  roleOptions: OrganizationRole[];
  currentUserId: string | undefined;
  onRefresh: () => void;
  onRoleChange: (memberId: string, role: OrganizationRole) => void;
  onRemove: (member: OrganizationMember) => void;
  onResend: (member: OrganizationMember) => void;
  onResendEmailInvite: (invite: OrganizationEmailInvite) => void;
  onCancelEmailInvite: (invite: OrganizationEmailInvite) => void;
};

export function MemberList({
  members,
  emailInvites,
  isLoading,
  status,
  emailInviteStatus,
  actionMemberId,
  actionType,
  emailInviteActionId,
  emailInviteActionType,
  currentRole,
  canManageMembers,
  canTransferOwnership,
  roleOptions,
  currentUserId,
  onRefresh,
  onRoleChange,
  onRemove,
  onResend,
  onResendEmailInvite,
  onCancelEmailInvite,
}: MemberListProps) {
  const { t, i18n } = useTranslation();

  return (
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
          onClick={onRefresh}
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
          <div className="text-sm text-text-muted">{t("org.membersLoading")}</div>
        ) : members.length === 0 ? (
          <div className="text-sm text-text-muted">{t("org.membersEmpty")}</div>
        ) : (
          members.map((member) => {
            const isSelf = member.user.id === currentUserId;
            const isOwner = member.role === "owner";
            const showResend =
              !!member.invited_at && !member.accepted_at && canManageMembers;
            const isBusy = actionMemberId === member.id;
            const canEditRole =
              canManageMembers &&
              (!isOwner || currentRole === "owner") &&
              !isSelf;

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
                          onRoleChange(
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
                      {isSelf && (
                        <span className="text-xs text-text-muted">
                          {t("org.memberRoleSelfLocked")}
                        </span>
                      )}
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
                          onClick={() => onResend(member)}
                          disabled={isBusy && actionType === "resend"}
                        >
                          {t("org.inviteResend")}
                        </Button>
                      )}
                      {canManageMembers && !isSelf && (
                        <Button
                          variant="ghost"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => onRemove(member)}
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
                      onClick={() => onResendEmailInvite(invite)}
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
                      onClick={() => onCancelEmailInvite(invite)}
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
  );
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
