import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import {
  acceptOrganizationInvitation,
  declineOrganizationInvitation,
  listOrganizationInvitations,
} from "@/features/organizations/api";
import type { OrganizationInvitation } from "@/features/organizations/types";
import { useOrganizationStore } from "@/features/organizations/state/useOrganizationStore";
import { getApiErrorMessage } from "@/shared/api/errors";

type StatusMessage = {
  tone: "success" | "error";
  message: string;
};

type OrganizationInvitationsProps = {
  variant?: "embedded" | "page";
  showHeader?: boolean;
};

export function OrganizationInvitations({
  variant = "embedded",
  showHeader = true,
}: OrganizationInvitationsProps) {
  const { t, i18n } = useTranslation();
  const loadOrganizations = useOrganizationStore((state) => state.loadOrganizations);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [actionMemberId, setActionMemberId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"accept" | "decline" | null>(null);
  const isPage = variant === "page";

  const {
    data: invitations,
    isLoading,
    isError,
    refetch,
  } = useQuery<OrganizationInvitation[], Error>({
    queryKey: ["organizationInvitations"],
    queryFn: listOrganizationInvitations,
  });

  const handleAccept = async (invitation: OrganizationInvitation) => {
    setStatus(null);
    setActionMemberId(invitation.member_id);
    setActionType("accept");
    try {
      await acceptOrganizationInvitation(
        invitation.organization.id,
        invitation.member_id,
      );
      await loadOrganizations();
      await refetch();
      setStatus({ tone: "success", message: t("org.invitationAccepted") });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getErrorMessage(error, t("org.invitationError")),
      });
    } finally {
      setActionMemberId(null);
      setActionType(null);
    }
  };

  const handleDecline = async (invitation: OrganizationInvitation) => {
    const confirmed = window.confirm(t("org.invitationDeclineConfirm"));
    if (!confirmed) return;
    setStatus(null);
    setActionMemberId(invitation.member_id);
    setActionType("decline");
    try {
      await declineOrganizationInvitation(
        invitation.organization.id,
        invitation.member_id,
      );
      await refetch();
      setStatus({ tone: "success", message: t("org.invitationDeclined") });
    } catch (error) {
      setStatus({
        tone: "error",
        message: getErrorMessage(error, t("org.invitationError")),
      });
    } finally {
      setActionMemberId(null);
      setActionType(null);
    }
  };

  if (isLoading) {
    if (!isPage) {
      return null;
    }
    return (
      <section className="rounded-2xl border border-border bg-surface p-4 text-sm text-text-secondary">
        {t("org.invitationsLoading")}
      </section>
    );
  }

  if (isError) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-4 text-sm text-red-400">
        {t("org.invitationLoadError")}
      </section>
    );
  }

  if (!invitations || invitations.length === 0) {
    if (!isPage) {
      return null;
    }
    return (
      <section className="rounded-2xl border border-border bg-surface p-4 text-sm text-text-secondary">
        {t("org.invitationsEmpty")}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 space-y-4">
      {showHeader && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {t("org.invitationsTitle")}
          </h2>
          <p className="text-sm text-text-secondary">
            {t("org.invitationsSubtitle")}
          </p>
        </div>
      )}

      {status && (
        <div
          className={
            status.tone === "success"
              ? "rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
              : "rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
          }
        >
          {status.message}
        </div>
      )}

      <div className="space-y-3">
        {invitations.map((invitation) => {
          const isBusy = actionMemberId === invitation.member_id;
          return (
            <div
              key={invitation.member_id}
              className="rounded-xl border border-border bg-bg-base px-4 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="space-y-1">
                <div className="text-sm font-medium text-text-primary">
                  {invitation.organization.name}
                </div>
                <div className="text-xs text-text-muted">
                  {invitation.organization.slug}
                </div>
                <div className="text-xs text-text-secondary">
                  {t("org.invitationRole")}{" "}
                  <span className="font-medium text-text-primary">
                    {t(`org.role${capitalize(invitation.role)}`)}
                  </span>
                </div>
                <div className="text-xs text-text-muted">
                  {t("org.invitationInvitedAt", {
                    date: formatInviteDate(
                      invitation.invited_at,
                      i18n.language,
                      t,
                    ),
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleDecline(invitation)}
                  disabled={isBusy}
                  isLoading={isBusy && actionType === "decline"}
                >
                  {t("org.invitationDecline")}
                </Button>
                <Button
                  onClick={() => handleAccept(invitation)}
                  disabled={isBusy}
                  isLoading={isBusy && actionType === "accept"}
                >
                  {t("org.invitationAccept")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
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

function capitalize(value: string) {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getErrorMessage(error: unknown, fallback: string) {
  return getApiErrorMessage(error, fallback);
}
