import axios from "axios";
import type { Board, BoardElement, CreateBoardRequest } from "@/types/board";

const api = axios.create({
  baseURL: "http://localhost:3000", // Assumed backend URL based on main.rs
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const createBoard = async (data: CreateBoardRequest): Promise<Board> => {
  const response = await api.post<Board>("/api/boards/", data);
  return response.data;
};

export const getBoardsList = async (): Promise<Board[]> => {
  const response = await api.get<Board[]>("/api/boards/list");
  return response.data;
};

export const getBoardElements = async (
  boardId: string,
): Promise<BoardElement[]> => {
  const response = await api.get<BoardElement[]>(
    `/api/boards/${boardId}/elements`,
  );
  return response.data;
};

export default api;
