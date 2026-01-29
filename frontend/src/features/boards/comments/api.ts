import { apiClient } from "@/shared/api/client";
import type {
  CommentListResponse,
  CreateBoardCommentRequest,
  ListBoardCommentsQuery,
  BoardComment,
} from "@/features/boards/types";

export const listBoardComments = async (
  boardId: string,
  query: ListBoardCommentsQuery,
): Promise<CommentListResponse> => {
  const response = await apiClient.get<CommentListResponse>(
    `/api/boards/${boardId}/comments`,
    { params: query },
  );
  return response.data;
};

export const createBoardComment = async (
  boardId: string,
  payload: CreateBoardCommentRequest,
): Promise<BoardComment> => {
  const response = await apiClient.post<BoardComment>(
    `/api/boards/${boardId}/comments`,
    payload,
  );
  return response.data;
};
