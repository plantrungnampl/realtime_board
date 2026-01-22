import { Button } from "@/components/ui/Button";

type UndoDeleteToastProps = {
  label: string;
  actionLabel: string;
  isRestoring: boolean;
  onUndo: () => void;
};

export function UndoDeleteToast({
  label,
  actionLabel,
  isRestoring,
  onUndo,
}: UndoDeleteToastProps) {
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-40 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-amber-400/30 bg-neutral-900/80 px-4 py-2 text-sm text-amber-100 shadow-lg backdrop-blur">
        <span>{label}</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={onUndo}
          disabled={isRestoring}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
