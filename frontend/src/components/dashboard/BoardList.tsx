import { Button } from "@/components/ui/Button";
import {
  ChevronDown,
  LayoutGrid,
  List,
  MoreHorizontal,
  Star,
  FileBox,
} from "lucide-react";
// import { useAppStore } from "@/store/useAppStore";
import { useNavigate } from "@tanstack/react-router";
import { CreateBoardDialog } from "./CreateBoardDialog";
import { useQuery } from "@tanstack/react-query";
import { getBoardsList } from "@/lib/api";
import type { Board } from "@/types/board";

export function BoardList() {
  // const user = useAppStore((state) => state.user);
  const navigate = useNavigate();

  const {
    data: boards,
    isLoading,
    isError,
    error,
  } = useQuery<Board[], Error>({
    queryKey: ["boardsList"],
    queryFn: getBoardsList,
  });
  console.log(boards);
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-text-primary">
              Boards in this team
            </h2>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm">
                Explore templates
              </Button>
              <CreateBoardDialog />
            </div>
          </div>
          <div className="flex items-center justify-between">
            {/* Filter placehoders */}
            <div className="flex items-center gap-2">
              <div className="h-8 w-24 bg-neutral-700 animate-pulse rounded-lg"></div>
              <div className="h-8 w-32 bg-neutral-700 animate-pulse rounded-lg"></div>
              <div className="h-8 w-20 bg-neutral-700 animate-pulse rounded-lg ml-4"></div>
            </div>
            {/* View toggle placeholders */}
            <div className="flex items-center bg-bg-surface rounded-lg p-0.5 border border-border">
              <div className="h-7 w-7 bg-neutral-700 animate-pulse rounded-lg"></div>
              <div className="h-7 w-7 bg-neutral-700 animate-pulse rounded-lg"></div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-bg-surface border-b border-border/50 transition-colors group cursor-pointer animate-pulse"
            >
              <div className="col-span-6 flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-neutral-700"></div>
                <div className="h-4 w-48 bg-neutral-700 rounded"></div>
              </div>
              <div className="col-span-2 h-4 w-20 bg-neutral-700 rounded"></div>
              <div className="col-span-2 h-4 w-24 bg-neutral-700 rounded"></div>
              <div className="col-span-2 h-4 w-16 bg-neutral-700 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-red-500 p-4">
        Error loading boards: {error?.message || "Unknown error"}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header & Filters */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-primary">
            Boards in this team
          </h2>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">
              Explore templates
            </Button>
            <CreateBoardDialog />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="border border-border text-text-secondary font-normal gap-2"
            >
              All boards
              <ChevronDown className="w-3 h-3 opacity-50" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="border border-border text-text-secondary font-normal gap-2"
            >
              Owned by anyone
              <ChevronDown className="w-3 h-3 opacity-50" />
            </Button>

            <div className="flex items-center gap-2 ml-4">
              <span className="text-xs text-text-muted">Sort by</span>
              <Button
                variant="ghost"
                size="sm"
                className="border border-border text-text-secondary font-normal gap-2"
              >
                Last opened
                <ChevronDown className="w-3 h-3 opacity-50" />
              </Button>
            </div>
          </div>

          <div className="flex items-center bg-bg-surface rounded-lg p-0.5 border border-border">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 rounded hover:bg-bg-elevated"
            >
              <LayoutGrid className="w-4 h-4 text-text-muted" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 rounded bg-bg-elevated shadow-sm"
            >
              <List className="w-4 h-4 text-text-primary" />
            </Button>
          </div>
        </div>
      </div>

      {/* Board List / Table */}
      <div className="w-full">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-text-muted border-b border-border">
          <div className="col-span-6">Name</div>
          <div className="col-span-2">Online users</div>
          <div className="col-span-2">Last opened</div>
          <div className="col-span-2">Owner</div>
        </div>

        {/* Table Body */}
        <div className="flex flex-col">
          {boards?.length === 0 ? (
            <div className="p-4 text-center text-text-muted">
              No boards found. Create a new one!
            </div>
          ) : (
            boards?.map((board) => (
              <div
                key={board.id}
                className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-bg-surface border-b border-border/50 transition-colors group cursor-pointer"
                onClick={() => navigate({ to: `/board/${board.id}` })}
              >
                <div className="col-span-6 flex items-center gap-3">
                  <div
                    className={`p-2 rounded bg-bg-elevated text-text-primary`}
                  >
                    <FileBox className="w-4 h-4" /> {/* Generic icon for now */}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-text-primary">
                      {board.name}
                    </span>
                    <span className="text-xs text-text-muted">
                      Modified by {board.username},{" "}
                      {new Date(board.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="col-span-2">
                  {/* Online users placeholder */}
                </div>

                <div className="col-span-2 text-xs text-text-secondary">
                  {new Date(board.updated_at).toLocaleDateString()}
                </div>

                <div className="col-span-2 flex items-center justify-between">
                  <span className="text-xs text-text-secondary">
                    {board.username}
                  </span>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-bg-elevated"
                    >
                      <Star className="w-4 h-4 text-text-muted hover:text-yellow-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-bg-elevated"
                    >
                      <MoreHorizontal className="w-4 h-4 text-text-muted" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
