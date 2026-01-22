import type {
  Board,
  BoardActionMessage,
  BoardElement,
  BoardElementResponse,
  BoardMember,
  BoardMembersResponse,
  CreateBoardRequest,
  CreateBoardElementRequest,
  DeleteBoardElementResponse,
  InviteBoardMembersRequest,
  InviteBoardMembersResponse,
  RestoreBoardElementResponse,
  TransferBoardOwnershipRequest,
  UpdateBoardRequest,
  UpdateBoardMemberRoleRequest,
  UpdateBoardElementRequest,
  BoardElementUpdateResponse,
  BoardFavoriteResponse,
} from "./types";
import { apiClient } from "@/shared/api/client";

export const createBoard = async (data: CreateBoardRequest): Promise<Board> => {
  const response = await apiClient.post<Board>("/api/boards/", data);
  return response.data;
};

type BoardListOptions = {
  organizationId?: string;
  isTemplate?: boolean;
};

export const getBoardsList = async (
  options: BoardListOptions = {},
): Promise<Board[]> => {
  const response = await apiClient.get<Board[]>("/api/boards/list", {
    params:
      options.organizationId || typeof options.isTemplate === "boolean"
        ? {
            organization_id: options.organizationId,
            is_template: options.isTemplate,
          }
        : undefined,
  });
  return response.data;
};

export const getBoardDetail = async (boardId: string): Promise<Board> => {
  const response = await apiClient.get<Board>(`/api/boards/${boardId}`);
  return response.data;
};

export const updateBoard = async (
  boardId: string,
  data: UpdateBoardRequest,
): Promise<Board> => {
  const response = await apiClient.patch<Board>(`/api/boards/${boardId}`, data);
  return response.data;
};

export const deleteBoard = async (boardId: string): Promise<BoardActionMessage> => {
  const response = await apiClient.delete<BoardActionMessage>(
    `/api/boards/${boardId}`,
  );
  return response.data;
};

export const restoreBoard = async (boardId: string): Promise<BoardActionMessage> => {
  const response = await apiClient.post<BoardActionMessage>(
    `/api/boards/${boardId}/restore`,
  );
  return response.data;
};

export const toggleBoardFavorite = async (
  boardId: string,
): Promise<BoardFavoriteResponse> => {
  const response = await apiClient.post<BoardFavoriteResponse>(
    `/api/boards/${boardId}/favorite`,
  );
  return response.data;
};

export const archiveBoard = async (boardId: string): Promise<BoardActionMessage> => {
  const response = await apiClient.post<BoardActionMessage>(
    `/api/boards/${boardId}/archive`,
  );
  return response.data;
};

export const unarchiveBoard = async (boardId: string): Promise<BoardActionMessage> => {
  const response = await apiClient.post<BoardActionMessage>(
    `/api/boards/${boardId}/unarchive`,
  );
  return response.data;
};

export const transferBoardOwnership = async (
  boardId: string,
  data: TransferBoardOwnershipRequest,
): Promise<BoardActionMessage> => {
  const response = await apiClient.post<BoardActionMessage>(
    `/api/boards/${boardId}/transfer-ownership`,
    data,
  );
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

export const createBoardElement = async (
  boardId: string,
  data: CreateBoardElementRequest,
): Promise<BoardElementResponse> => {
  const response = await apiClient.post<BoardElementResponse>(
    `/api/boards/${boardId}/elements`,
    data,
  );
  return response.data;
};

export const updateBoardElement = async (
  boardId: string,
  elementId: string,
  data: UpdateBoardElementRequest,
): Promise<BoardElementUpdateResponse> => {
  const response = await apiClient.patch<BoardElementUpdateResponse>(
    `/api/boards/${boardId}/elements/${elementId}`,
    data,
  );
  return response.data;
};

export const deleteBoardElement = async (
  boardId: string,
  elementId: string,
  expectedVersion: number,
): Promise<DeleteBoardElementResponse> => {
  const response = await apiClient.delete<DeleteBoardElementResponse>(
    `/api/boards/${boardId}/elements/${elementId}`,
    {
      params: { expected_version: expectedVersion },
    },
  );
  return response.data;
};

export const restoreBoardElement = async (
  boardId: string,
  elementId: string,
  expectedVersion: number,
): Promise<RestoreBoardElementResponse> => {
  const response = await apiClient.post<RestoreBoardElementResponse>(
    `/api/boards/${boardId}/elements/${elementId}/restore`,
    undefined,
    {
      params: { expected_version: expectedVersion },
    },
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
