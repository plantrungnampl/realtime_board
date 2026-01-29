import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquarePlus, X } from "lucide-react";

import { listBoardMembers } from "@/features/boards/api";
import { useBoardComments } from "@/features/boards/comments/hooks/useBoardComments";
import { extractMentionIds } from "@/features/boards/comments/utils";
import type {
  BoardComment,
  BoardMember,
} from "@/features/boards/types";
import { getApiErrorMessage } from "@/shared/api/errors";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type CommentTarget = {
  elementId: string | null;
  position: { x: number; y: number } | null;
};

type BoardCommentsPanelProps = {
  boardId: string;
  isOpen: boolean;
  canComment: boolean;
  defaultBoardPosition: { x: number; y: number } | null;
  target: CommentTarget | null;
  onTargetChange: (next: CommentTarget | null) => void;
  onClose: () => void;
};

const MAX_COMMENT_LENGTH = 5000;
const MAX_MENTIONS = 20;

export function BoardCommentsPanel({
  boardId,
  isOpen,
  canComment,
  defaultBoardPosition,
  target,
  onTargetChange,
  onClose,
}: BoardCommentsPanelProps) {
  const [content, setContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    comments,
    commentsQuery,
    createComment,
    createStatus,
  } = useBoardComments({
    boardId,
    enabled: isOpen,
  });

  const membersQuery = useQuery<BoardMember[], unknown>({
    queryKey: ["boardMembers", boardId],
    queryFn: () => listBoardMembers(boardId),
    enabled: isOpen,
  });

  const members = membersQuery.data ?? [];
  const membersById = useMemo(() => new Map(members.map((m) => [m.user.id, m])), [members]);

  const commentsError = commentsQuery.error
    ? getApiErrorMessage(commentsQuery.error, "Unable to load comments.")
    : null;

  const handleSubmit = async () => {
    setFormError(null);
    const trimmed = content.trim();
    if (!trimmed) {
      setFormError("Please enter a comment.");
      return;
    }
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setFormError(`Comment must be ${MAX_COMMENT_LENGTH} characters or less.`);
      return;
    }

    const mentionIds = extractMentionIds(trimmed, members);
    if (mentionIds.length > MAX_MENTIONS) {
      setFormError(`Mentions are limited to ${MAX_MENTIONS} users.`);
      return;
    }

    const nextTarget = target ?? {
      elementId: null,
      position: defaultBoardPosition,
    };
    if (!nextTarget.elementId && !nextTarget.position) {
      setFormError("Click on the board to choose a comment position.");
      return;
    }

    try {
      await createComment({
        content: trimmed,
        element_id: nextTarget.elementId ?? undefined,
        position_x: nextTarget.elementId ? undefined : nextTarget.position?.x ?? null,
        position_y: nextTarget.elementId ? undefined : nextTarget.position?.y ?? null,
        mentions: mentionIds.length ? mentionIds : undefined,
      });
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to post comment."));
      return;
    }

    setContent("");
    onTargetChange(null);
  };

  const renderTargetLabel = () => {
    if (!target) return "Comment on board";
    if (target.elementId) return "Comment on element";
    return "Comment on board position";
  };

  return (
    <aside
      aria-label="Board comments"
      className={cn(
        "absolute right-4 top-16 bottom-4 z-40 w-[340px] rounded-2xl border border-neutral-800 bg-neutral-900/90 shadow-xl backdrop-blur transition-all duration-200",
        isOpen
          ? "translate-x-0 opacity-100"
          : "translate-x-6 opacity-0 pointer-events-none",
      )}
    >
      <header className="flex items-center justify-between border-b border-neutral-800 px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
          <MessageSquarePlus className="h-4 w-4 text-yellow-400" />
          Comments
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comments"
          className="rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/60"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex h-full flex-col">
        <section className="flex-1 overflow-y-auto px-3 py-3">
          {commentsQuery.isLoading && (
            <p className="text-xs text-neutral-500">Loading comments…</p>
          )}
          {commentsError && (
            <p className="text-xs text-rose-400">{commentsError}</p>
          )}
          {!commentsQuery.isLoading && !commentsError && comments.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-800 p-4 text-xs text-neutral-500">
              No comments yet. Switch to the Comment tool and click on the board to drop your first
              note.
            </div>
          )}
          <div className="flex flex-col gap-3">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                member={membersById.get(comment.author.id)}
              />
            ))}
          </div>
          {commentsQuery.hasNextPage && (
            <button
              type="button"
              onClick={() => commentsQuery.fetchNextPage()}
              disabled={commentsQuery.isFetchingNextPage}
              className="mt-4 w-full rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-300 transition hover:border-neutral-700 hover:text-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-600"
            >
              {commentsQuery.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          )}
        </section>

        <section className="border-t border-neutral-800 px-3 py-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">
            {renderTargetLabel()}
          </div>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={3}
            placeholder={
              canComment
                ? "Write a comment… use @username to mention"
                : "You don’t have permission to comment."
            }
            disabled={!canComment || createStatus.isPending}
            className="w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/60 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
            <span>
              {formError ?? (canComment ? "Mentions notify board members." : "Read-only")}
            </span>
            <span
              className={cn(
                content.length > MAX_COMMENT_LENGTH ? "text-rose-400" : "text-neutral-500",
              )}
            >
              {content.length}/{MAX_COMMENT_LENGTH}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canComment || createStatus.isPending}
            className="mt-3 w-full rounded-xl bg-yellow-500 px-3 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {createStatus.isPending ? "Sending…" : "Post comment"}
          </button>
        </section>
      </div>
    </aside>
  );
}

function CommentItem({
  comment,
  member,
}: {
  comment: BoardComment;
  member?: BoardMember;
}) {
  const displayName = comment.author.display_name || comment.author.username;
  const timestamp = useMemo(() => {
    const date = new Date(comment.created_at);
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  }, [comment.created_at]);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-sm text-neutral-200">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Avatar className="h-6 w-6 border border-neutral-800">
          <AvatarImage src={member?.user.avatar_url ?? undefined} />
          <AvatarFallback className="bg-neutral-700 text-[10px] text-neutral-100">
            {displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="font-medium text-neutral-200">{displayName}</span>
        <span>•</span>
        <span>{timestamp}</span>
        {comment.element_id && (
          <span className="ml-auto rounded-full border border-neutral-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
            Element
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-neutral-200 whitespace-pre-wrap">{comment.content}</p>
    </div>
  );
}
