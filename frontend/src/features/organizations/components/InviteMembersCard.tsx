import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import type { StatusMessage } from "@/features/organizations/organizationMembers.types";
import type { OrganizationRole } from "@/features/organizations/types";

type InviteMembersCardProps = {
  inviteInput: string;
  invitees: string[];
  inviteRole: OrganizationRole;
  inviteStatus: StatusMessage | null;
  isInviting: boolean;
  canInvite: boolean;
  memberLimitReached: boolean;
  inviteSlotsRemaining: number | null;
  onInviteInputChange: (value: string) => void;
  onInviteInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onInviteRoleChange: (role: OrganizationRole) => void;
  onInviteAdd: () => void;
  onInviteRemove: (email: string) => void;
  onInviteSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function InviteMembersCard({
  inviteInput,
  invitees,
  inviteRole,
  inviteStatus,
  isInviting,
  canInvite,
  memberLimitReached,
  inviteSlotsRemaining,
  onInviteInputChange,
  onInviteInputKeyDown,
  onInviteRoleChange,
  onInviteAdd,
  onInviteRemove,
  onInviteSubmit,
}: InviteMembersCardProps) {
  const { t } = useTranslation();

  return (
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

      <form onSubmit={onInviteSubmit} className="mt-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr_auto] items-end">
          <div className="space-y-2">
            <Label htmlFor="member_invite">{t("org.inviteEmailLabel")}</Label>
            <Input
              id="member_invite"
              value={inviteInput}
              onChange={(event) => onInviteInputChange(event.target.value)}
              onKeyDown={onInviteInputKeyDown}
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
                onInviteRoleChange(event.target.value as OrganizationRole)
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
            onClick={onInviteAdd}
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
                    onClick={() => onInviteRemove(email)}
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
  );
}
