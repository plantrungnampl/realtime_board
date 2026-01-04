import { create } from "zustand";

import type { OrganizationSummary } from "../types";
import { listOrganizations } from "../api";
import {
  clearOrganizationStorage,
  getStoredCurrentOrganization,
  getStoredOrganizations,
  setStoredCurrentOrganization,
  setStoredOrganizations,
} from "../storage";

interface OrganizationState {
  organizations: OrganizationSummary[];
  currentOrganization: OrganizationSummary | null;
  isLoading: boolean;
  addOrganization: (organization: OrganizationSummary) => void;
  setCurrentOrganization: (organization: OrganizationSummary | null) => void;
  loadOrganizations: () => Promise<void>;
  clearOrganizations: () => void;
}

const storedOrganizations = getStoredOrganizations();
const initialCurrent = getStoredCurrentOrganization() ?? storedOrganizations[0] ?? null;
const initialOrganizations = (() => {
  if (!initialCurrent) return storedOrganizations;
  const withoutCurrent = storedOrganizations.filter((org) => org.id !== initialCurrent.id);
  return [initialCurrent, ...withoutCurrent];
})();

if (initialCurrent) {
  setStoredCurrentOrganization(initialCurrent);
  setStoredOrganizations(initialOrganizations);
}

export const useOrganizationStore = create<OrganizationState>((set) => ({
  organizations: initialOrganizations,
  currentOrganization: initialCurrent,
  isLoading: false,

  addOrganization: (organization) =>
    set((state) => {
      const existing = state.organizations.filter((org) => org.id !== organization.id);
      const updated = [organization, ...existing];
      setStoredOrganizations(updated);
      return { organizations: updated };
    }),

  setCurrentOrganization: (organization) =>
    set(() => {
      setStoredCurrentOrganization(organization);
      return { currentOrganization: organization };
    }),

  loadOrganizations: async () => {
    set({ isLoading: true });
    try {
      const organizations = await listOrganizations();
      setStoredOrganizations(organizations);
      set((state) => {
        const current =
          state.currentOrganization &&
          organizations.find((org) => org.id === state.currentOrganization?.id)
            ? state.currentOrganization
            : organizations[0] ?? null;
        setStoredCurrentOrganization(current);
        return {
          organizations,
          currentOrganization: current,
          isLoading: false,
        };
      });
    } catch {
      set({ isLoading: false });
    }
  },

  clearOrganizations: () =>
    set(() => {
      clearOrganizationStorage();
      return { organizations: [], currentOrganization: null };
    }),
}));
