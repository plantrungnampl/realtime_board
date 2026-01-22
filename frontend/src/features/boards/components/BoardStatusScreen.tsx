import { Button } from "@/components/ui/Button";

export type StatusMessage = {
  tone: "success" | "error";
  message: string;
};

type StatusAction = {
  label: string;
  onClick: () => void;
  isLoading?: boolean;
  loadingLabel?: string;
  variant?: "default" | "secondary";
};

type BoardStatusScreenProps = {
  title: string;
  subtitle: string;
  status?: StatusMessage | null;
  primaryAction: StatusAction;
  secondaryAction: StatusAction;
  hint: string;
};

export function BoardStatusScreen({
  title,
  subtitle,
  status,
  primaryAction,
  secondaryAction,
  hint,
}: BoardStatusScreenProps) {
  const primaryLabel = primaryAction.isLoading
    ? primaryAction.loadingLabel ?? primaryAction.label
    : primaryAction.label;
  const secondaryLabel = secondaryAction.isLoading
    ? secondaryAction.loadingLabel ?? secondaryAction.label
    : secondaryAction.label;

  return (
    <div className="min-h-screen w-full bg-neutral-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6 text-neutral-100 shadow-xl">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-neutral-400">{subtitle}</p>
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
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            variant={secondaryAction.variant ?? "secondary"}
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.isLoading}
          >
            {secondaryLabel}
          </Button>
          <Button onClick={primaryAction.onClick} disabled={primaryAction.isLoading}>
            {primaryLabel}
          </Button>
        </div>
        <p className="mt-3 text-xs text-neutral-500">{hint}</p>
      </div>
    </div>
  );
}
