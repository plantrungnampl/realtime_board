export type StatusMessage = {
  tone: "success" | "error";
  message: string;
};

export type MemberActionType = "role" | "remove" | "resend" | null;

export type EmailInviteActionType = "resend" | "cancel" | null;
