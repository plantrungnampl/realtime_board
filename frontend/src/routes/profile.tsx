import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useAppStore } from "@/store/useAppStore";
import type { UserPreferences } from "@/features/auth/types";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/shared/api/errors";

type StatusMessage = {
  tone: "success" | "error";
  message: string;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  language: "en",
  notifications: {
    email: true,
    push: true,
    mentions: true,
  },
  defaultBoardSettings: {
    gridEnabled: true,
    snapToGrid: true,
  },
};

function normalizePreferences(preferences?: UserPreferences): UserPreferences {
  return {
    theme: preferences?.theme ?? DEFAULT_PREFERENCES.theme,
    language: preferences?.language ?? DEFAULT_PREFERENCES.language,
    notifications: {
      email:
        preferences?.notifications?.email ?? DEFAULT_PREFERENCES.notifications.email,
      push:
        preferences?.notifications?.push ?? DEFAULT_PREFERENCES.notifications.push,
      mentions:
        preferences?.notifications?.mentions ??
        DEFAULT_PREFERENCES.notifications.mentions,
    },
    defaultBoardSettings: {
      gridEnabled:
        preferences?.defaultBoardSettings?.gridEnabled ??
        DEFAULT_PREFERENCES.defaultBoardSettings?.gridEnabled ??
        true,
      snapToGrid:
        preferences?.defaultBoardSettings?.snapToGrid ??
        DEFAULT_PREFERENCES.defaultBoardSettings?.snapToGrid ??
        true,
    },
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return getApiErrorMessage(error, fallback);
}

export const Route = createFileRoute("/profile")({
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
  component: Profile,
});

function Profile() {
  const navigate = useNavigate();
  const user = useAppStore((state) => state.user);
  const isLoading = useAppStore((state) => state.isLoading);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const updatePreferences = useAppStore((state) => state.updatePreferences);
  const changePassword = useAppStore((state) => state.changePassword);
  const deleteAccount = useAppStore((state) => state.deleteAccount);

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const { t, i18n } = useTranslation();

  const [profileStatus, setProfileStatus] = useState<StatusMessage | null>(null);
  const [preferencesStatus, setPreferencesStatus] = useState<StatusMessage | null>(
    null,
  );
  const [passwordStatus, setPasswordStatus] = useState<StatusMessage | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<StatusMessage | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const resolvedDisplayName = displayName ?? user?.display_name ?? "";
  const resolvedAvatarUrl = avatarUrl ?? user?.avatar_url ?? "";
  const resolvedBio = bio ?? user?.bio ?? "";
  const resolvedPreferences = preferences ?? normalizePreferences(user?.preferences);

  const subscriptionLabel = user?.subscription_tier
    ? `${user.subscription_tier.charAt(0).toUpperCase()}${user.subscription_tier.slice(1)}`
    : "Free";
  const subscriptionExpires = (() => {
    if (!user?.subscription_expires_at) {
      return t("profile.noExpiry");
    }
    const date = new Date(user.subscription_expires_at);
    if (Number.isNaN(date.getTime())) {
      return t("profile.unknown");
    }
    return new Intl.DateTimeFormat(i18n.language).format(date);
  })();

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileStatus(null);
    try {
      await updateProfile({
        display_name: resolvedDisplayName,
        avatar_url: resolvedAvatarUrl.trim() ? resolvedAvatarUrl : null,
        bio: resolvedBio.trim() ? resolvedBio : null,
      });
      setProfileStatus({ tone: "success", message: "Profile updated." });
    } catch (error) {
      setProfileStatus({
        tone: "error",
        message: getErrorMessage(error, "Profile update failed."),
      });
    }
  };

  const handlePreferencesSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setPreferencesStatus(null);
    try {
      await updatePreferences(resolvedPreferences);
      setPreferencesStatus({ tone: "success", message: "Preferences saved." });
    } catch (error) {
      setPreferencesStatus({
        tone: "error",
        message: getErrorMessage(error, "Preferences update failed."),
      });
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordStatus(null);
    if (newPassword !== confirmPassword) {
      setPasswordStatus({
        tone: "error",
        message: "New password confirmation does not match.",
      });
      return;
    }
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus({ tone: "success", message: "Password updated." });
    } catch (error) {
      setPasswordStatus({
        tone: "error",
        message: getErrorMessage(error, "Password change failed."),
      });
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteStatus(null);
    try {
      await deleteAccount({
        password: deletePassword,
        confirmation: deleteConfirmation,
      });
      navigate({ to: "/" });
    } catch (error) {
      setDeleteStatus({
        tone: "error",
        message: getErrorMessage(error, "Delete account failed."),
      });
    }
  };

  const updateNotification = (key: keyof UserPreferences["notifications"]) => {
    setPreferences((prev) => {
      const next = prev ?? resolvedPreferences;
      return {
        ...next,
        notifications: {
          ...next.notifications,
          [key]: !next.notifications[key],
        },
      };
    });
  };

  const updateBoardSetting = (
    key: keyof NonNullable<UserPreferences["defaultBoardSettings"]>,
  ) => {
    setPreferences((prev) => {
      const next = prev ?? resolvedPreferences;
      const defaults = {
        gridEnabled: next.defaultBoardSettings?.gridEnabled ?? true,
        snapToGrid: next.defaultBoardSettings?.snapToGrid ?? true,
      };
      return {
        ...next,
        defaultBoardSettings: {
          ...defaults,
          [key]: !defaults[key],
        },
      };
    });
  };

  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-body">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-10 space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-text-primary font-heading">
            {t("profile.title")}
          </h1>
          <p className="text-text-secondary">
            {t("profile.subtitle")}
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-surface p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">
                {t("profile.accountOverview")}
              </h2>
              <p className="text-sm text-text-secondary">{user?.email}</p>
            </div>
            <div className="rounded-xl border border-border bg-bg-base px-4 py-3 text-sm text-text-secondary">
              <div className="font-medium text-text-primary">{subscriptionLabel}</div>
              <div>
                {t("profile.expires")}: {subscriptionExpires}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">
              {t("profile.profileInfo")}
            </h2>
            <p className="text-sm text-text-secondary">
              {t("profile.profileInfoDesc")}
            </p>
          </div>
          <form onSubmit={handleProfileSubmit} className="space-y-5">
            {profileStatus && (
              <div
                className={
                  profileStatus.tone === "success"
                    ? "rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
                    : "rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
                }
              >
                {profileStatus.message}
              </div>
            )}
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="display_name">{t("profile.displayName")}</Label>
                <Input
                  id="display_name"
                  value={resolvedDisplayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="avatar_url">{t("profile.avatarUrl")}</Label>
                <Input
                  id="avatar_url"
                  value={resolvedAvatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  placeholder="https://example.com/avatar.png"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">{t("profile.bio")}</Label>
              <textarea
                id="bio"
                rows={4}
                className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 focus-visible:ring-offset-2 ring-offset-bg-base"
                value={resolvedBio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Tell us a little about yourself"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Saving..." : t("profile.saveProfile")}
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">
              {t("profile.preferences")}
            </h2>
            <p className="text-sm text-text-secondary">
              {t("profile.preferencesDesc")}
            </p>
          </div>
          <form onSubmit={handlePreferencesSubmit} className="space-y-6">
            {preferencesStatus && (
              <div
                className={
                  preferencesStatus.tone === "success"
                    ? "rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
                    : "rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
                }
              >
                {preferencesStatus.message}
              </div>
            )}
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="theme">{t("profile.theme")}</Label>
                <select
                  id="theme"
                  className="h-10 w-full rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 focus-visible:ring-offset-2 ring-offset-bg-base"
                  value={resolvedPreferences.theme}
                  onChange={(event) =>
                    setPreferences((prev) => ({
                      ...(prev ?? resolvedPreferences),
                      theme: event.target.value,
                    }))
                  }
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">{t("profile.language")}</Label>
                <select
                  id="language"
                  className="h-10 w-full rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 focus-visible:ring-offset-2 ring-offset-bg-base"
                  value={resolvedPreferences.language}
                  onChange={(event) =>
                    setPreferences((prev) => ({
                      ...(prev ?? resolvedPreferences),
                      language: event.target.value,
                    }))
                  }
                >
                  <option value="en">English</option>
                  <option value="vi">Vietnamese</option>
                </select>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <div className="text-sm font-medium text-text-primary">
                  {t("profile.notifications")}
                </div>
                {(["email", "push", "mentions"] as const).map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-3 text-sm text-text-secondary"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border border-border bg-bg-base text-yellow-500 focus:ring-yellow-500/50"
                      checked={resolvedPreferences.notifications[key]}
                      onChange={() => updateNotification(key)}
                    />
                    {key === "email" && t("profile.emailNotifications")}
                    {key === "push" && t("profile.pushNotifications")}
                    {key === "mentions" && t("profile.mentions")}
                  </label>
                ))}
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium text-text-primary">
                  {t("profile.boardDefaults")}
                </div>
                <label className="flex items-center gap-3 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border border-border bg-bg-base text-yellow-500 focus:ring-yellow-500/50"
                      checked={resolvedPreferences.defaultBoardSettings?.gridEnabled ?? true}
                      onChange={() => updateBoardSetting("gridEnabled")}
                    />
                  {t("profile.enableGrid")}
                </label>
                <label className="flex items-center gap-3 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border border-border bg-bg-base text-yellow-500 focus:ring-yellow-500/50"
                      checked={resolvedPreferences.defaultBoardSettings?.snapToGrid ?? true}
                      onChange={() => updateBoardSetting("snapToGrid")}
                    />
                  {t("profile.snapToGrid")}
                </label>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Saving..." : t("profile.savePreferences")}
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">
              {t("profile.security")}
            </h2>
            <p className="text-sm text-text-secondary">
              {t("profile.securityDesc")}
            </p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            {passwordStatus && (
              <div
                className={
                  passwordStatus.tone === "success"
                    ? "rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
                    : "rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
                }
              >
                {passwordStatus.message}
              </div>
            )}
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="current_password">{t("profile.currentPassword")}</Label>
                <Input
                  id="current_password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_password">{t("profile.newPassword")}</Label>
                <Input
                  id="new_password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">{t("profile.confirmPassword")}</Label>
              <Input
                id="confirm_password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Updating..." : t("profile.changePassword")}
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-red-400">
              {t("profile.dangerZone")}
            </h2>
            <p className="text-sm text-text-secondary">
              {t("profile.dangerDesc")}
            </p>
          </div>
          {deleteStatus && (
            <div
              className={
                deleteStatus.tone === "success"
                  ? "rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
                  : "rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
              }
            >
              {deleteStatus.message}
            </div>
          )}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary" className="border-red-500/40 text-red-200">
                {t("profile.deleteAccount")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("profile.deleteDialogTitle")}</DialogTitle>
                <DialogDescription>
                  {t("profile.deleteDialogDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="delete_password">{t("profile.deletePassword")}</Label>
                  <Input
                    id="delete_password"
                    type="password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delete_confirmation">
                    {t("profile.deleteConfirmation")}
                  </Label>
                  <Input
                    id="delete_confirmation"
                    placeholder="DELETE MY ACCOUNT"
                    value={deleteConfirmation}
                    onChange={(event) => setDeleteConfirmation(event.target.value)}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setDeletePassword("");
                      setDeleteConfirmation("");
                    }}
                  >
                    {t("profile.cancel")}
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  className="bg-red-500 text-white hover:bg-red-400"
                  onClick={handleDeleteAccount}
                  disabled={isLoading}
                >
                  {isLoading ? "Deleting..." : t("profile.confirmDelete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      </div>
    </div>
  );
}
