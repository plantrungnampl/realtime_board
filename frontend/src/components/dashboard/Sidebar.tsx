import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { 
  Search, 
  Home, 
  Clock, 
  Star, 
  Plus, 
  ChevronDown,
  LayoutGrid
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useOrganizationStore } from '@/features/organizations/state/useOrganizationStore'
import { useEffect } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function Sidebar() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const currentOrganization = useOrganizationStore((state) => state.currentOrganization)
  const organizations = useOrganizationStore((state) => state.organizations)
  const setCurrentOrganization = useOrganizationStore((state) => state.setCurrentOrganization)
  const loadOrganizations = useOrganizationStore((state) => state.loadOrganizations)
  const isOrgLoading = useOrganizationStore((state) => state.isLoading)

  useEffect(() => {
    loadOrganizations().catch(() => undefined)
  }, [loadOrganizations])

  const navItems = [
    { icon: Home, label: 'Home', active: true },
    { icon: Clock, label: 'Recent', active: false },
    { icon: Star, label: 'Starred', active: false },
  ]

  const orgName = currentOrganization?.name ?? t('org.personalWorkspace')
  const orgInitials = getInitials(orgName)

  return (
    <div className="w-64 border-r border-border bg-bg-base flex flex-col h-full">
      {/* Team Switcher */}
      <div className="p-4 border-b border-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-bg-surface cursor-pointer transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center text-neutral-900 font-bold text-sm">
                  {orgInitials}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs text-text-muted">{t("org.workspacesLabel")}</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {orgName}
                  </span>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-text-secondary group-hover:text-text-primary" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-64 bg-bg-base border-border/70 text-text-primary shadow-xl"
            align="start"
            side="bottom"
            forceMount
          >
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-text-muted">
              {t("org.workspacesLabel")}
            </DropdownMenuLabel>
            {isOrgLoading ? (
              <DropdownMenuItem disabled className="text-text-muted">
                {t("org.loading")}
              </DropdownMenuItem>
            ) : organizations.length > 0 ? (
              organizations.map((organization) => (
                <DropdownMenuItem
                  key={organization.id}
                  onSelect={() => setCurrentOrganization(organization)}
                  className="focus:bg-elevated cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-text-primary">
                      {organization.name}
                    </span>
                    <span className="text-xs text-text-muted">{organization.slug}</span>
                  </div>
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled className="text-text-muted">
                {t("org.noWorkspace")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-border/70" />
            {currentOrganization && (
              <>
                <DropdownMenuItem
                  onSelect={() =>
                    navigate({
                      to: "/organizations/$orgId/members",
                      params: { orgId: currentOrganization.id },
                    })
                  }
                  className="focus:bg-bg-surface cursor-pointer"
                >
                  {t("org.manageMembers")}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border/70" />
              </>
            )}
            <DropdownMenuItem
              onSelect={() => navigate({ to: "/organizations/new" })}
              className="focus:bg-elevated cursor-pointer"
            >
              {t("nav.createOrganization")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Search */}
      <div className="px-4 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <Input 
            placeholder="Search..." 
            className="pl-9 bg-bg-surface border-border text-sm h-9"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-2 space-y-1">
        {navItems.map((item) => (
          <Button
            key={item.label}
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3 h-10 font-normal",
              item.active ? "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 hover:text-blue-400" : "text-text-secondary hover:text-text-primary hover:bg-bg-surface"
            )}
          >
            <item.icon className={cn("w-4 h-4", item.active ? "text-blue-500" : "text-text-muted")} />
            {item.label}
          </Button>
        ))}
      </nav>

      {/* Spaces */}
      <div className="mt-8 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Spaces</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-bg-surface">
            <Plus className="w-4 h-4 text-text-muted" />
          </Button>
        </div>
        {/* Add spaces list here later */}
      </div>

      {/* Bottom Actions */}
      <div className="mt-auto p-4 border-t border-border">
        <Button variant="ghost" className="w-full justify-start gap-3 text-text-secondary hover:text-text-primary">
            <LayoutGrid className="w-4 h-4" />
            More apps
        </Button>
      </div>
    </div>
  )
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "WS";
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("") || "WS";
}
