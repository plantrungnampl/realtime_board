import { useState } from "react";

import {
  cancelOrganizationEmailInvite,
  inviteOrganizationMembers,
  resendOrganizationEmailInvite,
} from "@/features/organizations/api";
import type { EmailInviteActionType } from "@/features/organizations/organizationMembers.types";
import type {
  InviteMembersRequest,
  OrganizationActionMessage,
} from "@/features/organizations/types";

type InviteMembersMutation = {
  isInviting: boolean;
  sendInvites: (payload: InviteMembersRequest) => Promise<void>;
};

type EmailInviteMutations = {
  emailInviteActionId: string | null;
  emailInviteActionType: EmailInviteActionType;
  resendEmailInvite: (inviteId: string) => Promise<void>;
  cancelEmailInvite: (inviteId: string) => Promise<void>;
};

type EmailInviteActionRunner = () => Promise<OrganizationActionMessage>;

export function useInviteMembersMutation(
  organizationId: string,
): InviteMembersMutation {
  const [isInviting, setIsInviting] = useState(false);

  const sendInvites = async (payload: InviteMembersRequest) => {
    setIsInviting(true);
    try {
      await inviteOrganizationMembers(organizationId, payload);
    } finally {
      setIsInviting(false);
    }
  };

  return { isInviting, sendInvites };
}

export function useOrganizationEmailInviteMutations(
  organizationId: string,
): EmailInviteMutations {
  const [emailInviteActionId, setEmailInviteActionId] = useState<string | null>(
    null,
  );
  const [emailInviteActionType, setEmailInviteActionType] =
    useState<EmailInviteActionType>(null);

  const runEmailInviteAction = async (
    inviteId: string,
    type: EmailInviteActionType,
    action: EmailInviteActionRunner,
  ) => {
    setEmailInviteActionId(inviteId);
    setEmailInviteActionType(type);
    try {
      await action();
    } finally {
      setEmailInviteActionId(null);
      setEmailInviteActionType(null);
    }
  };

  const resendEmailInvite = (inviteId: string) =>
    runEmailInviteAction(inviteId, "resend", () =>
      resendOrganizationEmailInvite(organizationId, inviteId),
    );

  const cancelEmailInvite = (inviteId: string) =>
    runEmailInviteAction(inviteId, "cancel", () =>
      cancelOrganizationEmailInvite(organizationId, inviteId),
    );

  return {
    emailInviteActionId,
    emailInviteActionType,
    resendEmailInvite,
    cancelEmailInvite,
  };
}
