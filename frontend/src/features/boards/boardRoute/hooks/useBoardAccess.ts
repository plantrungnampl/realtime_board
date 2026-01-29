import { useCallback, useEffect, useMemo, useState } from "react";

import { listBoardMembers } from "@/features/boards/api";
import { isWorkspaceInviteRequired } from "@/features/boards/boardRoute/errors";
import { resolveEffectivePermissions, resolveRolePermissions } from "@/features/boards/permissions";
import type { RoleUpdateEvent } from "@/features/boards/realtime/protocol";
import type { BoardPermissions, BoardRole } from "@/features/boards/types";

const EDIT_ROLES = new Set<BoardRole>(["owner", "admin", "editor"]);

type NavigateFn = (options: { to: string; search?: Record<string, string> }) => void;

type BoardAccessState = {
  key: string;
  role: BoardRole | null;
  permissions: BoardPermissions | null;
};

type UseBoardAccessOptions = {
  boardId: string;
  userId: string;
  userEmail: string;
  navigate: NavigateFn;
  onEditRestriction: (nextPermissions: BoardPermissions) => void;
};

export const useBoardAccess = ({
  boardId,
  userId,
  userEmail,
  navigate,
  onEditRestriction,
}: UseBoardAccessOptions) => {
  const roleKey = `${boardId}:${userId}`;
  const [boardAccessState, setBoardAccessState] = useState<BoardAccessState>(() => ({
    key: roleKey,
    role: null,
    permissions: null,
  }));

  const boardRole = useMemo(
    () => (boardAccessState.key === roleKey ? boardAccessState.role : null),
    [boardAccessState.key, boardAccessState.role, roleKey],
  );
  const boardPermissions = useMemo(
    () =>
      boardAccessState.key === roleKey ? boardAccessState.permissions : null,
    [boardAccessState.key, boardAccessState.permissions, roleKey],
  );
  const isRoleLoading = boardRole === null && Boolean(userId);

  const handleRoleUpdate = useCallback(
    (event: RoleUpdateEvent) => {
      if (!userId) return;
      if (event.userId !== userId) return;
      if (event.role === null) {
        setBoardAccessState({ key: roleKey, role: null, permissions: null });
        navigate({ to: "/dashboard" });
        return;
      }
      const nextRole = event.role;
      const nextPermissions = event.permissions ?? resolveRolePermissions(nextRole);
      setBoardAccessState({
        key: roleKey,
        role: nextRole,
        permissions: nextPermissions,
      });
      if (!EDIT_ROLES.has(nextRole)) {
        onEditRestriction(nextPermissions);
      }
    },
    [navigate, onEditRestriction, roleKey, userId],
  );

  const handleRoleOverride = useCallback(
    (role: BoardRole) => {
      setBoardAccessState({
        key: roleKey,
        role,
        permissions: resolveRolePermissions(role),
      });
      if (!EDIT_ROLES.has(role)) {
        onEditRestriction(resolveRolePermissions(role));
      }
    },
    [onEditRestriction, roleKey],
  );

  useEffect(() => {
    let isMounted = true;
    if (!userId) return () => undefined;
    const currentKey = roleKey;
    listBoardMembers(boardId)
      .then((members) => {
        if (!isMounted) return;
        const current = members.find((member) => member.user.id === userId);
        const role = current?.role ?? "viewer";
        const permissions = resolveEffectivePermissions(
          role,
          current?.custom_permissions,
          current?.effective_permissions ?? null,
        );
        setBoardAccessState({
          key: currentKey,
          role,
          permissions,
        });
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        if (isWorkspaceInviteRequired(error)) {
          navigate({
            to: "/invitations",
            search: {
              notice: "workspace-invite-required",
              email: userEmail,
            },
          });
          return;
        }
        setBoardAccessState({
          key: currentKey,
          role: "viewer",
          permissions: resolveRolePermissions("viewer"),
        });
      });

    return () => {
      isMounted = false;
    };
  }, [boardId, navigate, roleKey, userEmail, userId]);

  return {
    boardRole,
    boardPermissions,
    isRoleLoading,
    handleRoleUpdate,
    handleRoleOverride,
  };
};
