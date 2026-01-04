import { apiClient } from "@/shared/api/client";

import type {
  CreateOrganizationRequest,
  InviteMembersRequest,
  InviteMembersResponse,
  Organization,
  OrganizationActionMessage,
  OrganizationEmailInvite,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationSummary,
  OrganizationUsage,
  SlugAvailabilityResponse,
  UpdateMemberRoleRequest,
} from "./types";

export async function createOrganization(
  data: CreateOrganizationRequest,
): Promise<Organization> {
  const response = await apiClient.post<Organization>("/organizations", data);
  return response.data;
}

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const response = await apiClient.get<{ data: OrganizationSummary[] }>(
    "/organizations",
  );
  return response.data.data;
}

export async function checkSlugAvailability(
  slug: string,
): Promise<SlugAvailabilityResponse> {
  const response = await apiClient.get<SlugAvailabilityResponse>(
    "/organizations/slug-availability",
    {
      params: { slug },
    },
  );
  return response.data;
}

export async function inviteOrganizationMembers(
  organizationId: string,
  data: InviteMembersRequest,
): Promise<InviteMembersResponse> {
  const response = await apiClient.post<InviteMembersResponse>(
    `/organizations/${organizationId}/members`,
    data,
  );
  return response.data;
}

export async function listOrganizationMembers(
  organizationId: string,
): Promise<OrganizationMember[]> {
  const response = await apiClient.get<{ data: OrganizationMember[] }>(
    `/organizations/${organizationId}/members`,
  );
  return response.data.data;
}

export async function getOrganizationUsage(
  organizationId: string,
): Promise<OrganizationUsage> {
  const response = await apiClient.get<OrganizationUsage>(
    `/organizations/${organizationId}/usage`,
  );
  return response.data;
}

export async function listOrganizationEmailInvites(
  organizationId: string,
): Promise<OrganizationEmailInvite[]> {
  const response = await apiClient.get<{ data: OrganizationEmailInvite[] }>(
    `/organizations/${organizationId}/invites`,
  );
  return response.data.data;
}

export async function resendOrganizationEmailInvite(
  organizationId: string,
  inviteId: string,
): Promise<OrganizationActionMessage> {
  const response = await apiClient.post<OrganizationActionMessage>(
    `/organizations/${organizationId}/invites/${inviteId}/resend`,
  );
  return response.data;
}

export async function cancelOrganizationEmailInvite(
  organizationId: string,
  inviteId: string,
): Promise<OrganizationActionMessage> {
  const response = await apiClient.delete<OrganizationActionMessage>(
    `/organizations/${organizationId}/invites/${inviteId}`,
  );
  return response.data;
}

export async function updateOrganizationMemberRole(
  organizationId: string,
  memberId: string,
  data: UpdateMemberRoleRequest,
): Promise<OrganizationActionMessage> {
  const response = await apiClient.patch<OrganizationActionMessage>(
    `/organizations/${organizationId}/members/${memberId}`,
    data,
  );
  return response.data;
}

export async function removeOrganizationMember(
  organizationId: string,
  memberId: string,
): Promise<OrganizationActionMessage> {
  const response = await apiClient.delete<OrganizationActionMessage>(
    `/organizations/${organizationId}/members/${memberId}`,
  );
  return response.data;
}

export async function resendOrganizationInvite(
  organizationId: string,
  memberId: string,
): Promise<OrganizationActionMessage> {
  const response = await apiClient.post<OrganizationActionMessage>(
    `/organizations/${organizationId}/members/${memberId}/resend`,
  );
  return response.data;
}

export async function listOrganizationInvitations(): Promise<
  OrganizationInvitation[]
> {
  const response = await apiClient.get<{ data: OrganizationInvitation[] }>(
    "/users/me/invitations",
  );
  return response.data.data;
}

export async function acceptOrganizationInvitation(
  organizationId: string,
  memberId: string,
): Promise<OrganizationActionMessage> {
  const response = await apiClient.post<OrganizationActionMessage>(
    `/organizations/${organizationId}/members/${memberId}/accept`,
  );
  return response.data;
}

export async function declineOrganizationInvitation(
  organizationId: string,
  memberId: string,
): Promise<OrganizationActionMessage> {
  const response = await apiClient.delete<OrganizationActionMessage>(
    `/organizations/${organizationId}/members/${memberId}/decline`,
  );
  return response.data;
}
