import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/store/useAppStore";

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmail,
});

function VerifyEmail() {
  const navigate = useNavigate();
  const { verifyEmail, isLoading, error } = useAppStore();
  const search = Route.useSearch() as { token?: string };
  const token = search.token;
  const [status, setStatus] = useState<"idle" | "success" | "error">(() =>
    token ? "idle" : "error",
  );
  const [message, setMessage] = useState<string>(() =>
    token ? "" : "Missing verification token.",
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    let isActive = true;
    verifyEmail(token)
      .then((responseMessage) => {
        if (!isActive) return;
        setStatus("success");
        setMessage(responseMessage);
      })
      .catch((verifyError) => {
        if (!isActive) return;
        setStatus("error");
        setMessage(
          verifyError instanceof Error
            ? verifyError.message
            : "Email verification failed.",
        );
      });
    return () => {
      isActive = false;
    };
  }, [token, verifyEmail]);

  const resolvedStatus = token ? status : "error";
  const resolvedMessage = token ? message : "Missing verification token.";
  const isSuccess = resolvedStatus === "success";
  const isError = resolvedStatus === "error";

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 px-4 font-body">
      <div className="w-full max-w-md space-y-6 p-8 bg-neutral-800 rounded-xl border border-neutral-700 text-center">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-neutral-200 font-heading">
            Email verification
          </h2>
          <p className="text-sm text-neutral-400">
            {isLoading && status === "idle"
              ? "Verifying your email..."
              : "We will update your verification status below."}
          </p>
        </div>

        {(resolvedMessage || error) && (
          <div
            className={
              isSuccess
                ? "p-3 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-md"
                : "p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md"
            }
          >
            {resolvedMessage || error}
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          {isSuccess ? (
            <Button onClick={() => navigate({ to: "/dashboard" })}>
              Go to dashboard
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => navigate({ to: "/login" })}
            >
              Back to login
            </Button>
          )}
        </div>
        {isError && (
          <p className="text-xs text-neutral-500">
            If the link has expired, request a new verification email.
          </p>
        )}
      </div>
    </div>
  );
}
