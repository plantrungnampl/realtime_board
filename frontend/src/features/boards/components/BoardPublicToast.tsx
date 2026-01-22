import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

type BoardPublicToastProps = {
  isEnabled: boolean;
  isVisible: boolean;
  message: string;
};

export function BoardPublicToast({
  isEnabled,
  isVisible,
  message,
}: BoardPublicToastProps) {
  if (!isEnabled) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-12 z-40 -translate-x-1/2">
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-xs text-amber-100 shadow-lg backdrop-blur transition-all",
          isVisible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
        )}
      >
        <Globe className="h-3.5 w-3.5" />
        <span>{message}</span>
      </div>
    </div>
  );
}
