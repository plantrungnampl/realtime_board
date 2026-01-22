import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { createBoard, getBoardsList } from "@/features/boards/api";
import type { Board } from "@/features/boards/types";
import { useQueryClient } from "@tanstack/react-query";
import { useOrganizationStore } from "@/features/organizations/state/useOrganizationStore";
import { getOrganizationUsage } from "@/features/organizations/api";
import type { OrganizationUsage } from "@/features/organizations/types";
import { getApiErrorMessage } from "@/shared/api/errors";

export type BoardUsageSnapshot = Pick<
  OrganizationUsage,
  "boards_used" | "boards_limit" | "boards_warning"
>;

type CreateBoardDialogProps = {
  personalUsage?: BoardUsageSnapshot | null;
  personalUsageLoading?: boolean;
  personalUsageError?: string | null;
};

export function CreateBoardDialog({
  personalUsage = null,
  personalUsageLoading = false,
  personalUsageError = null,
}: CreateBoardDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateBoardId, setTemplateBoardId] = useState("");
  const [templates, setTemplates] = useState<Board[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState(false);
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
  const isPublic = true;

  const isOrganizationWorkspace = Boolean(currentOrganization?.id);
  const boardUsage = isOrganizationWorkspace ? usage : personalUsage;
  const boardUsageError = isOrganizationWorkspace ? usageError : personalUsageError;
  const isBoardUsageLoading = isOrganizationWorkspace
    ? isUsageLoading
    : personalUsageLoading;
  const boardLimitReached = boardUsage
    ? isLimitReached(boardUsage.boards_used, boardUsage.boards_limit)
    : false;
  const templateSelected = templateBoardId !== "";

  const handleOpenCreateDialog = () => {
    if (boardLimitReached) {
      setIsLimitDialogOpen(true);
      return;
    }
    setIsOpen(true);
  };

  useEffect(() => {
    if (isOpen) return;
    setName("");
    setDescription("");
    setTemplateBoardId("");
    setTemplates([]);
    setTemplatesError(null);
  }, [currentOrganization?.id, isOpen]);

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

  useEffect(() => {
    if (!isOpen) return;
    let canceled = false;
    setIsTemplatesLoading(true);
    setTemplatesError(null);
    getBoardsList({
      organizationId: currentOrganization?.id,
      isTemplate: true,
    })
      .then((data) => {
        if (canceled) return;
        setTemplates(data);
      })
      .catch((error: unknown) => {
        if (canceled) return;
        setTemplatesError(getErrorMessage(error, "Unable to load templates."));
      })
      .finally(() => {
        if (canceled) return;
        setIsTemplatesLoading(false);
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
        name: name.trim(),
        description: description.trim() ? description.trim() : undefined,
        organization_id: currentOrganization?.id,
        is_public: isPublic,
        template_board_id: templateSelected ? templateBoardId : undefined,
      });
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["boardsList"] });
      navigate({ href: `/board/${newBoard.id}` });
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, "Failed to create board."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewPlans = () => {
    setIsLimitDialogOpen(false);
    navigate({ to: "/pricing" });
  };

  return (
    <>
      <Button
        size="sm"
        className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
        onClick={handleOpenCreateDialog}
        disabled={isLoading}
      >
        <Plus className="w-4 h-4" />
        Create new
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Create board</DialogTitle>
          <DialogDescription>
            Enter a name for your new board. Click create when you're done.
          </DialogDescription>
        </DialogHeader>
        {(isOrganizationWorkspace ||
          boardUsage ||
          boardUsageError ||
          isBoardUsageLoading) && (
          <div className="rounded-lg border border-border bg-bg-base px-4 py-3 text-sm text-text-secondary">
            <div className="flex items-center justify-between">
              <span>
                {isOrganizationWorkspace ? "Board usage" : "Personal board usage"}
              </span>
              {boardUsage ? (
                <span
                  className={
                    boardUsage.boards_warning ? "text-yellow-400" : ""
                  }
                >
                  {formatUsageLabel(
                    boardUsage.boards_used,
                    boardUsage.boards_limit,
                  )}
                </span>
              ) : isBoardUsageLoading ? (
                <span className="text-text-muted">Loading...</span>
              ) : boardUsageError ? (
                <span className="text-red-400">{boardUsageError}</span>
              ) : null}
            </div>
            {boardUsage && (
              <div className="mt-2 h-2 rounded-full bg-border/60">
                <div
                  className={
                    boardUsage.boards_warning
                      ? "h-full rounded-full bg-yellow-400"
                      : "h-full rounded-full bg-text-secondary/70"
                  }
                  style={{
                    width: `${getUsagePercent(
                      boardUsage.boards_used,
                      boardUsage.boards_limit,
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
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="description" className="text-right text-text-primary">
              Description
            </Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional summary for this board"
              className="col-span-3 min-h-[80px] rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="template" className="text-right text-text-primary">
              Template
            </Label>
            <select
              id="template"
              value={templateBoardId}
              onChange={(e) => setTemplateBoardId(e.target.value)}
              className="col-span-3 h-10 rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
              disabled={isTemplatesLoading}
            >
              <option value="">Blank board</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
          <div
            className={
              templatesError ? "text-xs text-red-400" : "text-xs text-text-muted"
            }
          >
            {isTemplatesLoading
              ? "Loading templates..."
              : templatesError
                ? templatesError
                : templates.length === 0
                  ? "No templates available yet."
                  : "Pick a template to start with prebuilt content."}
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
      <Dialog open={isLimitDialogOpen} onOpenChange={setIsLimitDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <DialogTitle>Board limit reached</DialogTitle>
                <DialogDescription>
                  You have hit the board limit for this workspace. Upgrade your plan
                  or remove old boards to create a new one.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {boardUsage && (
            <div className="rounded-lg border border-border bg-bg-base px-4 py-3 text-sm text-text-secondary">
              <div className="flex items-center justify-between">
                <span>{isOrganizationWorkspace ? "Workspace usage" : "Personal usage"}</span>
                <span className="text-text-primary">
                  {formatUsageLabel(
                    boardUsage.boards_used,
                    boardUsage.boards_limit,
                  )}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-border/60">
                <div
                  className="h-full rounded-full bg-yellow-400"
                  style={{
                    width: `${getUsagePercent(
                      boardUsage.boards_used,
                      boardUsage.boards_limit,
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsLimitDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-500 text-white"
              onClick={handleViewPlans}
            >
              View plans
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
