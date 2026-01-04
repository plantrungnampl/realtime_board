import type {
  Board,
  BoardActionMessage,
  BoardElement,
  BoardMember,
  BoardMembersResponse,
  CreateBoardRequest,
  InviteBoardMembersRequest,
  InviteBoardMembersResponse,
  UpdateBoardMemberRoleRequest,
} from "./types";
import { apiClient } from "@/shared/api/client";

export const createBoard = async (data: CreateBoardRequest): Promise<Board> => {
  const response = await apiClient.post<Board>("/api/boards/", data);
  return response.data;
};

export const getBoardsList = async (): Promise<Board[]> => {
  const response = await apiClient.get<Board[]>("/api/boards/list");
  return response.data;
};

export const getBoardElements = async (
  boardId: string,
): Promise<BoardElement[]> => {
  const response = await apiClient.get<BoardElement[]>(
    `/api/boards/${boardId}/elements`,
  );
  return response.data;
};

export const listBoardMembers = async (
  boardId: string,
): Promise<BoardMember[]> => {
  const response = await apiClient.get<BoardMembersResponse>(
    `/api/boards/${boardId}/members`,
  );
  return response.data.data;
};

export const inviteBoardMembers = async (
  boardId: string,
  data: InviteBoardMembersRequest,
): Promise<InviteBoardMembersResponse> => {
  const response = await apiClient.post<InviteBoardMembersResponse>(
    `/api/boards/${boardId}/members`,
    data,
  );
  return response.data;
};

export const updateBoardMemberRole = async (
  boardId: string,
  memberId: string,
  data: UpdateBoardMemberRoleRequest,
): Promise<BoardActionMessage> => {
  const response = await apiClient.patch<BoardActionMessage>(
    `/api/boards/${boardId}/members/${memberId}`,
    data,
  );
  return response.data;
};

export const removeBoardMember = async (
  boardId: string,
  memberId: string,
): Promise<BoardActionMessage> => {
  const response = await apiClient.delete<BoardActionMessage>(
    `/api/boards/${boardId}/members/${memberId}`,
  );
  return response.data;
};
