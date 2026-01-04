import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { createBoard } from "@/features/boards/api";
import {
  checkSlugAvailability,
  createOrganization,
  inviteOrganizationMembers,
} from "@/features/organizations/api";
import type {
  Organization,
  OrganizationSummary,
  OrganizationRole,
  SlugAvailabilityResponse,
} from "@/features/organizations/types";
import { useOrganizationStore } from "@/features/organizations/state/useOrganizationStore";
import { useAppStore } from "@/store/useAppStore";
import { getApiErrorMessage } from "@/shared/api/errors";

type Step = "details" | "invite";

type StatusMessage = {
  tone: "success" | "error";
  message: string;
};

const ROLE_OPTIONS: { value: OrganizationRole; labelKey: string }[] = [
  { value: "member", labelKey: "org.roleMember" },
  { value: "admin", labelKey: "org.roleAdmin" },
  { value: "guest", labelKey: "org.roleGuest" },
];

export const Route = createFileRoute("/organizations/new")({
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
  component: OrganizationCreate,
});

function OrganizationCreate() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const addOrganization = useOrganizationStore((state) => state.addOrganization);
  const setCurrentOrganization = useOrganizationStore(
    (state) => state.setCurrentOrganization,
  );

  const [step, setStep] = useState<Step>("details");
  const [organization, setOrganization] = useState<Organization | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugSuggestions, setSlugSuggestions] = useState<string[]>([]);
  const [slugResponse, setSlugResponse] = useState<SlugAvailabilityResponse | null>(
    null,
  );
  const [detailsStatus, setDetailsStatus] = useState<StatusMessage | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [inviteInput, setInviteInput] = useState("");
  const [invitees, setInvitees] = useState<string[]>([]);
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("member");
  const [inviteStatus, setInviteStatus] = useState<StatusMessage | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  const nameTrimmed = name.trim();
  const autoSlug = useMemo(() => normalizeSlug(nameTrimmed), [nameTrimmed]);
  const slugInputValue = slugTouched ? slug : autoSlug;
  const slugCandidate = useMemo(() => {
    const trimmed = slugInputValue.trim();
    if (trimmed.length === 0) {
      return autoSlug;
    }
    return normalizeSlug(trimmed);
  }, [autoSlug, slugInputValue]);
  const slugAdjusted =
    slugTouched &&
    slugInputValue.trim().length > 0 &&
    slugCandidate !== slugInputValue.trim().toLowerCase();

  const isNameValid = nameTrimmed.length > 0 && nameTrimmed.length <= 100;
  const isSlugValid = slugCandidate.length > 0 && isValidSlug(slugCandidate);
  const slugMatchesResponse = slugResponse?.slug === slugCandidate;
  const effectiveSlugStatus = slugMatchesResponse
    ? slugStatus
    : slugCandidate.length > 0
      ? "checking"
      : "idle";
  const canContinue =
    isNameValid &&
    isSlugValid &&
    slugStatus === "available" &&
    slugMatchesResponse &&
    !isCreating;

  useEffect(() => {
    if (slugCandidate.length === 0) {
      setSlugStatus("idle");
      setSlugSuggestions([]);
      setSlugResponse(null);
      return;
    }
    if (!isValidSlug(slugCandidate)) {
      setSlugStatus("invalid");
      setSlugSuggestions([]);
      setSlugResponse(null);
      return;
    }

    let cancelled = false;
    setSlugSuggestions([]);
    setSlugResponse(null);
    setSlugStatus("checking");
    const timer = window.setTimeout(async () => {
      try {
        const response = await checkSlugAvailability(slugCandidate);
        if (cancelled) return;
        setSlugResponse(response);
        if (response.available) {
          setSlugStatus("available");
          setSlugSuggestions([]);
          return;
        }
        setSlugStatus("unavailable");
        setSlugSuggestions(response.suggestions ?? []);
      } catch {
        if (!cancelled) {
          setSlugStatus("error");
          setSlugSuggestions([]);
          setSlugResponse(null);
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slugCandidate]);

  const slugHelper = useMemo(() => {
    if (effectiveSlugStatus === "checking") return t("org.slugChecking");
    if (effectiveSlugStatus === "available") return t("org.slugAvailable");
    if (effectiveSlugStatus === "unavailable") return t("org.slugUnavailable");
    if (effectiveSlugStatus === "invalid") return t("org.slugInvalid");
    if (effectiveSlugStatus === "error") return t("org.slugCheckError");
    return t("org.slugHint");
  }, [effectiveSlugStatus, t]);

  const handleDetailsSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDetailsStatus(null);

    if (!isNameValid) {
      setDetailsStatus({
        tone: "error",
        message: t("org.nameError"),
      });
      return;
    }

    if (!isSlugValid) {
      setDetailsStatus({
        tone: "error",
        message: t("org.slugInvalid"),
      });
      return;
    }

    if (slugStatus !== "available") {
      setDetailsStatus({
        tone: "error",
        message: t("org.slugUnavailable"),
      });
      return;
    }

    setIsCreating(true);
    try {
      const created = await createOrganization({
        name: nameTrimmed,
        slug: slugCandidate,
      });
      const summary: OrganizationSummary = {
        id: created.id,
        name: created.name,
        slug: created.slug,
        role: "owner",
      };
      addOrganization(summary);
      setCurrentOrganization(summary);
      setOrganization(created);
      setStep("invite");
      setDetailsStatus({
        tone: "success",
        message: t("org.workspaceCreated"),
      });
    } catch (error) {
      setDetailsStatus({
        tone: "error",
        message: getErrorMessage(error, t("org.error")),
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddInvite = () => {
    setInviteStatus(null);
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

  const handleFinish = async (skipInvites: boolean) => {
    if (!organization) return;
    setInviteStatus(null);
    setIsFinishing(true);

    try {
      let targets = invitees;
      if (!skipInvites) {
        const built = buildInviteList();
        if (!built) {
          setIsFinishing(false);
          return;
        }
        targets = built;
      }
      if (!skipInvites && targets.length > 0) {
        await inviteOrganizationMembers(organization.id, {
          emails: targets,
          role: inviteRole,
        });
      }

      const board = await createBoard({
        name: "Untitled",
        organization_id: organization.id,
      });
      navigate({ to: "/board/$boardId", params: { boardId: board.id } });
    } catch (error) {
      setInviteStatus({
        tone: "error",
        message: getErrorMessage(error, t("org.inviteError")),
      });
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-body">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <aside className="rounded-2xl border border-border bg-surface p-6 space-y-4">
            <div className="text-xs uppercase tracking-widest text-text-muted">
              {t("org.stepLabel", { current: step === "details" ? 1 : 2, total: 2 })}
            </div>
            <h1 className="text-3xl font-bold text-text-primary font-heading">
              {t("org.title")}
            </h1>
            <p className="text-text-secondary">{t("org.subtitle")}</p>
            <div className="space-y-3 text-sm text-text-secondary">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-yellow-400" />
                <span>{t("org.benefitBoards")}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-yellow-400" />
                <span>{t("org.benefitTeam")}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-yellow-400" />
                <span>{t("org.benefitBilling")}</span>
              </div>
            </div>
          </aside>

          <section className="rounded-2xl border border-border bg-surface p-6">
            {step === "details" && (
              <form onSubmit={handleDetailsSubmit} className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-text-primary">
                    {t("org.stepDetails")}
                  </h2>
                  <p className="text-sm text-text-secondary">
                    {t("org.stepDetailsDesc")}
                  </p>
                </div>

                {detailsStatus && (
                  <div
                    className={
                      detailsStatus.tone === "success"
                        ? "rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
                        : "rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
                    }
                  >
                    {detailsStatus.message}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="org_name">{t("org.name")}</Label>
                  <Input
                    id="org_name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("org.namePlaceholder")}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="org_slug">{t("org.slug")}</Label>
                  <div className="flex rounded-md border border-border bg-bg-base focus-within:ring-2 focus-within:ring-yellow-500/50 focus-within:ring-offset-2 ring-offset-bg-base">
                    <span className="flex items-center px-3 text-sm text-text-muted border-r border-border">
                      {t("org.slugPrefix")}
                    </span>
                    <input
                      id="org_slug"
                      className="h-10 flex-1 bg-transparent px-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none"
                      value={slugInputValue}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value.trim().length === 0) {
                          setSlugTouched(false);
                          setSlug("");
                          return;
                        }
                        setSlugTouched(true);
                        setSlug(value);
                      }}
                      placeholder={t("org.slugPlaceholder")}
                    />
                  </div>
                  <div className="space-y-1 text-xs text-text-secondary">
                    {slugAdjusted && slugCandidate.length > 0 && (
                      <div className="text-yellow-400">
                        {t("org.slugAdjusted", { slug: slugCandidate })}
                      </div>
                    )}
                    <div
                      className={
                        effectiveSlugStatus === "available"
                          ? "text-green-400"
                          : effectiveSlugStatus === "unavailable" ||
                              effectiveSlugStatus === "invalid"
                            ? "text-red-400"
                            : "text-text-secondary"
                      }
                    >
                      {slugHelper}
                    </div>
                    {slugResponse?.available === false && slugSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-text-muted">
                          {t("org.slugSuggestions")}
                        </span>
                        {slugSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            className="rounded-full border border-border bg-bg-base px-3 py-1 text-xs text-text-primary hover:bg-bg-surface"
                            onClick={() => {
                              setSlugTouched(true);
                              setSlug(suggestion);
                            }}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <Button type="submit" disabled={!canContinue}>
                    {isCreating ? t("org.creating") : t("org.continue")}
                  </Button>
                </div>
              </form>
            )}

            {step === "invite" && organization && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-text-primary">
                    {t("org.stepInvite")}
                  </h2>
                  <p className="text-sm text-text-secondary">
                    {t("org.inviteSubtitle")}
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-bg-base p-4 text-sm">
                  <div className="font-medium text-text-primary">
                    {organization.name}
                  </div>
                  <div className="text-text-secondary">
                    {t("org.slugPrefix")}
                    {organization.slug}
                  </div>
                </div>

                {inviteStatus && (
                  <div
                    className={
                      inviteStatus.tone === "success"
                        ? "rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
                        : "rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
                    }
                  >
                    {inviteStatus.message}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="invite_email">{t("org.inviteEmailLabel")}</Label>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div className="flex gap-2">
                      <Input
                        id="invite_email"
                        value={inviteInput}
                        onChange={(event) => setInviteInput(event.target.value)}
                        onKeyDown={handleInviteKey}
                        placeholder={t("org.inviteEmailPlaceholder")}
                      />
                      <select
                        className="h-10 rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50"
                        value={inviteRole}
                        onChange={(event) =>
                          setInviteRole(event.target.value as OrganizationRole)
                        }
                        aria-label={t("org.inviteRoleLabel")}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {t(option.labelKey)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleAddInvite}
                    >
                      {t("org.inviteAdd")}
                    </Button>
                  </div>
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
                            className="text-text-muted hover:text-text-primary"
                            onClick={() =>
                              setInvitees((prev) =>
                                prev.filter((value) => value !== email),
                              )
                            }
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isFinishing}
                    onClick={() => handleFinish(true)}
                  >
                    {t("org.inviteSkip")}
                  </Button>
                  <Button
                    type="button"
                    disabled={isFinishing}
                    onClick={() => handleFinish(false)}
                  >
                    {isFinishing ? t("org.finishCreatingBoard") : t("org.inviteFinish")}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

type SlugStatus = "idle" | "checking" | "available" | "unavailable" | "invalid" | "error";

function normalizeSlug(value: string): string {
  let slug = "";
  let lastHyphen = false;
  for (const char of value) {
    if (isAsciiAlphaNumeric(char)) {
      slug += char.toLowerCase();
      lastHyphen = false;
    } else if (!lastHyphen) {
      slug += "-";
      lastHyphen = true;
    }
  }

  slug = slug.replace(/^-+|-+$/g, "");
  slug = slug.slice(0, 100);
  slug = slug.replace(/^-+|-+$/g, "");
  return slug;
}

function isAsciiAlphaNumeric(value: string): boolean {
  const code = value.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function isValidSlug(value: string): boolean {
  return /^[a-z0-9-]{3,100}$/.test(value);
}

function parseEmails(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getErrorMessage(error: unknown, fallback: string) {
  return getApiErrorMessage(error, fallback);
}
