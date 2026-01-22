import type {
  BoardPermissionOverrides,
  BoardPermissions,
  BoardRole,
} from "./types";

const ROLE_PERMISSIONS: Record<BoardRole, BoardPermissions> = {
  owner: {
    canView: true,
    canEdit: true,
    canComment: true,
    canManageMembers: true,
    canManageBoard: true,
  },
  admin: {
    canView: true,
    canEdit: true,
    canComment: true,
    canManageMembers: true,
    canManageBoard: true,
  },
  editor: {
    canView: true,
    canEdit: true,
    canComment: true,
    canManageMembers: false,
    canManageBoard: false,
  },
  commenter: {
    canView: true,
    canEdit: false,
    canComment: true,
    canManageMembers: false,
    canManageBoard: false,
  },
  viewer: {
    canView: true,
    canEdit: false,
    canComment: false,
    canManageMembers: false,
    canManageBoard: false,
  },
};

export const resolveRolePermissions = (role: BoardRole): BoardPermissions =>
  ROLE_PERMISSIONS[role];

export const applyPermissionOverrides = (
  base: BoardPermissions,
  overrides?: BoardPermissionOverrides | null,
): BoardPermissions => ({
  canView: overrides?.canView ?? base.canView,
  canEdit: overrides?.canEdit ?? base.canEdit,
  canComment: overrides?.canComment ?? base.canComment,
  canManageMembers: overrides?.canManageMembers ?? base.canManageMembers,
  canManageBoard: overrides?.canManageBoard ?? base.canManageBoard,
});

export const resolveEffectivePermissions = (
  role: BoardRole,
  overrides?: BoardPermissionOverrides | null,
  effective?: BoardPermissions | null,
): BoardPermissions =>
  effective ?? applyPermissionOverrides(resolveRolePermissions(role), overrides);

export const buildPermissionOverrides = (
  permissions: BoardPermissions,
): BoardPermissionOverrides => ({
  canView: permissions.canView,
  canEdit: permissions.canEdit,
  canComment: permissions.canComment,
  canManageMembers: permissions.canManageMembers,
  canManageBoard: permissions.canManageBoard,
});

export const hasCustomPermissionOverrides = (
  overrides?: BoardPermissionOverrides | null,
): boolean => {
  if (!overrides) return false;
  return Object.values(overrides).some((value) => typeof value === "boolean");
};
