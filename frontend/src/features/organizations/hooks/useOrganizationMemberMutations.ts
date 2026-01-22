import { useState } from "react";

import {
  removeOrganizationMember,
  resendOrganizationInvite,
  updateOrganizationMemberRole,
} from "@/features/organizations/api";
import type { MemberActionType } from "@/features/organizations/organizationMembers.types";
import type {
  OrganizationActionMessage,
  OrganizationRole,
} from "@/features/organizations/types";

type MemberActionRunner = () => Promise<OrganizationActionMessage>;

type OrganizationMemberMutations = {
  actionMemberId: string | null;
  actionType: MemberActionType;
  updateRole: (memberId: string, role: OrganizationRole) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  resendInvite: (memberId: string) => Promise<void>;
};

export function useOrganizationMemberMutations(
  organizationId: string,
): OrganizationMemberMutations {
  const [actionMemberId, setActionMemberId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<MemberActionType>(null);

  const runMemberAction = async (
    memberId: string,
    type: MemberActionType,
    action: MemberActionRunner,
  ) => {
    setActionMemberId(memberId);
    setActionType(type);
    try {
      await action();
    } finally {
      setActionMemberId(null);
      setActionType(null);
    }
  };

  const updateRole = (memberId: string, role: OrganizationRole) =>
    runMemberAction(memberId, "role", () =>
      updateOrganizationMemberRole(organizationId, memberId, { role }),
    );

  const removeMember = (memberId: string) =>
    runMemberAction(memberId, "remove", () =>
      removeOrganizationMember(organizationId, memberId),
    );

  const resendInvite = (memberId: string) =>
    runMemberAction(memberId, "resend", () =>
      resendOrganizationInvite(organizationId, memberId),
    );

  return {
    actionMemberId,
    actionType,
    updateRole,
    removeMember,
    resendInvite,
  };
}
