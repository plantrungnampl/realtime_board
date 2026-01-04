import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useAppStore } from "@/store/useAppStore";
import { getToken } from "@/features/auth/storage";

export const Route = createFileRoute("/register/setup")({
  beforeLoad: () => {
    const token = getToken();
    if (!token) {
      throw redirect({
        to: "/login",
      });
    }
  },
  component: RegisterSetup,
});

function RegisterSetup() {
  const navigate = useNavigate();
  const user = useAppStore((state) => state.user);
  const isLoading = useAppStore((state) => state.isLoading);
  const error = useAppStore((state) => state.error);
  const requiresEmailVerification = useAppStore(
    (state) => state.requiresEmailVerification,
  );
  const loadProfileSetup = useAppStore((state) => state.loadProfileSetup);
  const completeProfileSetup = useAppStore((state) => state.completeProfileSetup);
  const requestVerification = useAppStore((state) => state.requestVerification);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [verificationStatus, setVerificationStatus] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);

  const resolvedDisplayName = displayName ?? user?.display_name ?? "";
  const resolvedAvatarUrl = avatarUrl ?? user?.avatar_url ?? "";
  const resolvedBio = bio ?? user?.bio ?? "";

  useEffect(() => {
    if (!user) {
      loadProfileSetup().catch(() => undefined);
    }
  }, [loadProfileSetup, user]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerificationStatus(null);
    await completeProfileSetup({
      display_name: resolvedDisplayName,
      avatar_url: resolvedAvatarUrl.trim() ? resolvedAvatarUrl : null,
      bio: resolvedBio.trim() ? resolvedBio : null,
    });
    const shouldVerify = useAppStore.getState().requiresEmailVerification;
    if (shouldVerify) {
      setVerificationStatus({
        message: "Profile saved. Verify your email to access full features.",
        tone: "success",
      });
      return;
    }
    navigate({ to: "/dashboard" });
  }

  const handleRequestVerification = async () => {
    try {
      const message = await requestVerification();
      setVerificationStatus({
        message,
        tone: "success",
      });
      setCooldownSeconds(120);
    } catch (requestError) {
      const errorMessage =
        requestError instanceof Error
          ? requestError.message
          : "Failed to request verification email.";
      const match = errorMessage.match(/wait (\d+) seconds/i);
      if (match) {
        const parsed = Number.parseInt(match[1], 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          setCooldownSeconds(parsed);
        }
      }
      setVerificationStatus(
        {
          message: errorMessage,
          tone: "error",
        },
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 px-4 font-body">
      <div className="w-full max-w-lg space-y-8 p-8 bg-neutral-800 rounded-xl border border-neutral-700">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-neutral-200 font-heading">
            Set up your profile
          </h2>
          <p className="text-sm text-neutral-400">
            Add a few details so your teammates recognize you.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          {(error || verificationStatus) && (
            <div
              className={
                verificationStatus?.tone === "success"
                  ? "p-3 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-md"
                  : "p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md"
              }
            >
              {verificationStatus?.message || error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="display_name">Display Name</Label>
            <Input
              id="display_name"
              required
              type="text"
              autoCapitalize="words"
              autoComplete="name"
              autoCorrect="off"
              value={resolvedDisplayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avatar_url">Avatar URL (optional)</Label>
            <Input
              id="avatar_url"
              type="url"
              placeholder="https://example.com/avatar.png"
              autoCapitalize="none"
              autoComplete="url"
              autoCorrect="off"
              value={resolvedAvatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio (optional)</Label>
            <textarea
              id="bio"
              rows={4}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-yellow-500"
              placeholder="Tell us a little about yourself"
              value={resolvedBio}
              onChange={(event) => setBio(event.target.value)}
            />
          </div>
          {requiresEmailVerification && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900/70 px-4 py-3 text-sm text-neutral-300">
              <div className="flex items-center justify-between gap-3">
                <span>
                  We sent a verification email. If you did not receive it, resend.
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleRequestVerification}
                    disabled={isLoading || cooldownSeconds > 0}
                  >
                    {cooldownSeconds > 0
                      ? `Resend in ${cooldownSeconds}s`
                      : "Send verification email"}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate({ to: "/dashboard" })}
            >
              Skip for now
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Finish setup"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
