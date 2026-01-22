import { getApiErrorMessage } from "@/shared/api/errors";

export const isWorkspaceInviteRequired = (error: unknown) => {
  const message = getApiErrorMessage(error, "");
  if (!message) return false;
  return message.toLowerCase().includes("workspace invitation");
};
