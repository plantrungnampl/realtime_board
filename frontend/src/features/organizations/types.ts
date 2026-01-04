export type OrganizationSubscriptionTier =
  | "Free"
  | "Starter"
  | "Professional"
  | "Enterprise";

export type OrganizationRole = "owner" | "admin" | "member" | "guest";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logo_url?: string | null;
  subscription_tier: OrganizationSubscriptionTier;
  max_members: number;
  max_boards: number;
  storage_limit_mb: number;
  created_at: string;
}

export type OrganizationSummary = Pick<
  Organization,
  "id" | "name" | "slug"
> & {
  role?: OrganizationRole;
};

export interface CreateOrganizationRequest {
  name: string;
  slug?: string | null;
  description?: string | null;
  logo_url?: string | null;
  subscription_tier?: OrganizationSubscriptionTier;
}

export interface SlugAvailabilityResponse {
  slug: string;
  available: boolean;
  adjusted: boolean;
  suggestions: string[];
}

export interface InviteMembersRequest {
  email?: string | null;
  emails?: string[];
  role?: OrganizationRole;
}

export interface InviteMembersResponse {
  invited: string[];
  pending?: string[];
}

export interface OrganizationMemberUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
}

export interface OrganizationMember {
  id: string;
  user: OrganizationMemberUser;
  role: OrganizationRole;
  invited_at?: string | null;
  accepted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInvitationOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface OrganizationInvitation {
  member_id: string;
  organization: OrganizationInvitationOrganization;
  role: OrganizationRole;
  invited_at?: string | null;
}

export interface OrganizationEmailInvite {
  id: string;
  email: string;
  role: OrganizationRole;
  invited_at?: string | null;
  invite_expires_at?: string | null;
}

export interface OrganizationUsage {
  members_used: number;
  members_limit: number;
  boards_used: number;
  boards_limit: number;
  storage_used_mb: number;
  storage_limit_mb: number;
  members_warning: boolean;
  boards_warning: boolean;
  storage_warning: boolean;
}

export interface OrganizationActionMessage {
  message: string;
}

export interface UpdateMemberRoleRequest {
  role: OrganizationRole;
}
