import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { Button } from "@/components/ui/Button";
import { OrganizationInvitations } from "@/features/organizations/components/OrganizationInvitations";
import { useAppStore } from "@/store/useAppStore";

type InvitationSearch = {
  email?: string;
  notice?: string;
};

export const Route = createFileRoute("/invitations")({
  beforeLoad: async ({ location }) => {
    const store = useAppStore.getState();
    const email = getSearchParam(
      location.search as Record<string, unknown> | undefined,
      "email",
    );
    const token = localStorage.getItem("token");
    if (!token) {
      throw redirect({
        to: "/login",
        search: buildLoginSearch(email),
      });
    }

    await store.checkAuth();
    const latestState = useAppStore.getState();
    if (!latestState.isAuthenticated) {
      throw redirect({
        to: "/login",
        search: buildLoginSearch(email),
      });
    }
    if (latestState.requiresEmailVerification) {
      throw redirect({
        to: "/register/setup",
      });
    }
  },
  component: InvitationsPage,
});

function InvitationsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useAppStore((state) => state.user);
  const logout = useAppStore((state) => state.logout);
  const search = Route.useSearch() as InvitationSearch;

  const invitedEmail = normalizeEmail(search.email);
  const signedInEmail = normalizeEmail(user?.email);
  const hasMismatch =
    Boolean(invitedEmail && signedInEmail) && invitedEmail !== signedInEmail;
  const displayInvitedEmail = search.email?.trim() || invitedEmail || "";
  const notice = search.notice?.trim();

  const handleSwitchAccount = () => {
    const nextSearch = buildLoginSearch(displayInvitedEmail);
    logout();
    navigate({ to: "/login", search: nextSearch });
  };

  return (
    <div className="flex h-screen bg-bg-base text-text-primary font-body overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />

        <main className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 max-w-[1200px] mx-auto w-full flex flex-col gap-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-text-primary">
                  {t("org.invitationsTitle")}
                </h1>
                <p className="text-sm text-text-secondary">
                  {t("org.invitationsSubtitle")}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => navigate({ to: "/dashboard" })}
              >
                {t("org.backToDashboard")}
              </Button>
            </div>

            {notice === "workspace-invite-required" && !hasMismatch ? (
              <section className="rounded-2xl border border-border bg-surface p-5 space-y-2">
                <div className="text-sm font-semibold text-text-primary">
                  {t("org.invitationRequiredTitle")}
                </div>
                <p className="text-sm text-text-secondary">
                  {t("org.invitationRequiredMessage")}
                </p>
              </section>
            ) : null}

            {hasMismatch ? (
              <section className="rounded-2xl border border-border bg-surface p-5 space-y-3">
                <div className="text-sm font-semibold text-text-primary">
                  {t("org.invitationMismatchTitle")}
                </div>
                <p className="text-sm text-text-secondary">
                  {t("org.invitationMismatchMessage", {
                    signedInEmail: user?.email ?? "-",
                    invitedEmail: displayInvitedEmail || "-",
                  })}
                </p>
                <div>
                  <Button onClick={handleSwitchAccount}>
                    {t("org.invitationSwitchAccount")}
                  </Button>
                </div>
              </section>
            ) : (
              <OrganizationInvitations variant="page" showHeader={false} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function getSearchParam(
  search: Record<string, unknown> | undefined,
  key: string,
) {
  if (!search) return undefined;
  const value = search[key];
  return typeof value === "string" ? value : undefined;
}

function buildLoginSearch(email?: string) {
  if (email && email.trim()) {
    return { redirect: "/invitations", email: email.trim() };
  }
  return { redirect: "/invitations" };
}

function normalizeEmail(value?: string | null) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}
