import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type {
  BoardComment,
  CommentListResponse,
  CommentStatus,
  CreateBoardCommentRequest,
} from "@/features/boards/types";
import { createBoardComment, listBoardComments } from "@/features/boards/comments/api";

const PAGE_SIZE = 50;

type UseBoardCommentsOptions = {
  boardId: string;
  elementId?: string | null;
  parentId?: string | null;
  status?: CommentStatus;
  enabled?: boolean;
};

export function useBoardComments({
  boardId,
  elementId,
  parentId,
  status,
  enabled = true,
}: UseBoardCommentsOptions) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["boardComments", boardId, elementId ?? null, parentId ?? null, status ?? "all"],
    [boardId, elementId, parentId, status],
  );

  const commentsQuery = useInfiniteQuery<CommentListResponse>({
    queryKey,
    queryFn: ({ pageParam }) =>
      listBoardComments(boardId, {
        element_id: elementId ?? undefined,
        parent_id: parentId ?? undefined,
        status,
        limit: PAGE_SIZE,
        cursor: typeof pageParam === "string" ? pageParam : undefined,
      }),
    initialPageParam: null,
    enabled,
    getNextPageParam: (lastPage) =>
      lastPage.pagination?.has_more ? lastPage.pagination.next_cursor ?? undefined : undefined,
  });

  const comments = useMemo<BoardComment[]>(
    () =>
      commentsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [commentsQuery.data],
  );

  const createMutation = useMutation({
    mutationFn: (payload: CreateBoardCommentRequest) =>
      createBoardComment(boardId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    comments,
    queryKey,
    commentsQuery,
    createComment: createMutation.mutateAsync,
    createStatus: createMutation,
  };
}
