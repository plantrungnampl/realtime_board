import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { createBoard } from "@/features/boards/api";
import { useQueryClient } from "@tanstack/react-query";
import { useOrganizationStore } from "@/features/organizations/state/useOrganizationStore";
import { getOrganizationUsage } from "@/features/organizations/api";
import type { OrganizationUsage } from "@/features/organizations/types";
import { getApiErrorMessage } from "@/shared/api/errors";

export function CreateBoardDialog() {
  const [name, setName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [usage, setUsage] = useState<OrganizationUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [isUsageLoading, setIsUsageLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentOrganization = useOrganizationStore(
    (state) => state.currentOrganization,
  );

  const boardLimitReached = usage
    ? isLimitReached(usage.boards_used, usage.boards_limit)
    : false;

  useEffect(() => {
    if (!isOpen || !currentOrganization?.id) {
      setUsage(null);
      setUsageError(null);
      if (!isOpen) {
        setErrorMessage(null);
      }
      return;
    }

    let canceled = false;
    setIsUsageLoading(true);
    setUsageError(null);
    getOrganizationUsage(currentOrganization.id)
      .then((data) => {
        if (canceled) return;
        setUsage(data);
      })
      .catch((error: unknown) => {
        if (canceled) return;
        setUsageError(getErrorMessage(error, "Unable to load usage details."));
      })
      .finally(() => {
        if (canceled) return;
        setIsUsageLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [currentOrganization?.id, isOpen]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (boardLimitReached) {
      setErrorMessage(
        "Board limit reached for this workspace. Upgrade or remove boards to continue.",
      );
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const newBoard = await createBoard({
        name,
        organization_id: currentOrganization?.id,
      });
      setIsOpen(false);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["boardsList"] });
      navigate({ href: `/board/${newBoard.id}` });
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, "Failed to create board."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          Create new
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create board</DialogTitle>
          <DialogDescription>
            Enter a name for your new board. Click create when you're done.
          </DialogDescription>
        </DialogHeader>
        {currentOrganization?.id && (
          <div className="rounded-lg border border-border bg-bg-base px-4 py-3 text-sm text-text-secondary">
            <div className="flex items-center justify-between">
              <span>Board usage</span>
              {usage ? (
                <span className={usage.boards_warning ? "text-yellow-400" : ""}>
                  {formatUsageLabel(usage.boards_used, usage.boards_limit)}
                </span>
              ) : isUsageLoading ? (
                <span className="text-text-muted">Loading...</span>
              ) : usageError ? (
                <span className="text-red-400">{usageError}</span>
              ) : null}
            </div>
            {usage && (
              <div className="mt-2 h-2 rounded-full bg-border/60">
                <div
                  className={
                    usage.boards_warning
                      ? "h-full rounded-full bg-yellow-400"
                      : "h-full rounded-full bg-text-secondary/70"
                  }
                  style={{
                    width: `${getUsagePercent(
                      usage.boards_used,
                      usage.boards_limit,
                    )}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
        {boardLimitReached && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
            Board limit reached for this workspace. Upgrade or remove boards to
            create more.
          </div>
        )}
        {errorMessage && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errorMessage}
          </div>
        )}
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right text-text-primary">
              Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Board"
              className="col-span-3 text-text-primary bg-bg-base border-border"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => setIsOpen(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isLoading || !name.trim() || boardLimitReached}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            {isLoading ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isLimitReached(used: number, limit: number) {
  if (limit <= 0) {
    return false;
  }

  return used >= limit;
}

function getUsagePercent(used: number, limit: number) {
  if (limit <= 0) {
    return 0;
  }

  const percent = Math.round((used / limit) * 100);
  return Math.min(100, Math.max(0, percent));
}

function formatUsageLabel(used: number, limit: number) {
  if (limit <= 0) {
    return `${used} used · Unlimited`;
  }

  return `${used} / ${limit}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return getApiErrorMessage(error, fallback);
}
