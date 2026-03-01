import { Button } from '@/components/ui/Button'
import { Bell, Gift, UserPlus } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useOrganizationStore } from '@/features/organizations/state/useOrganizationStore'
import { inviteOrganizationMembers } from '@/features/organizations/api'
import type { OrganizationRole } from '@/features/organizations/types'
import { useState } from 'react'
import { getApiErrorMessage } from '@/shared/api/errors'

type StatusMessage = {
  tone: "success" | "error";
  message: string;
};

export function TopBar() {
  const user = useAppStore((state) => state.user)
  const logout = useAppStore((state) => state.logout)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const currentOrganization = useOrganizationStore(
    (state) => state.currentOrganization,
  )
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteInput, setInviteInput] = useState("")
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("member")
  const [inviteStatus, setInviteStatus] = useState<StatusMessage | null>(null)
  const [isInviting, setIsInviting] = useState(false)

  const displayName = user?.display_name || user?.username || 'User'
  const avatarFallback = displayName.charAt(0).toUpperCase()

  const handleLogout = () => {
    logout()
    navigate({ to: '/login' })
  }

  const handleInviteSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentOrganization) return
    setInviteStatus(null)

    const emails = parseEmails(inviteInput)
    if (emails.length === 0) {
      setInviteStatus({
        tone: "error",
        message: t("org.inviteEmpty"),
      })
      return
    }

    const invalid = emails.filter((email) => !isValidEmail(email))
    if (invalid.length > 0) {
      setInviteStatus({
        tone: "error",
        message: t("org.inviteErrorInvalid", {
          emails: invalid.join(", "),
        }),
      })
      return
    }

    setIsInviting(true)
    try {
      await inviteOrganizationMembers(currentOrganization.id, {
        emails,
        role: inviteRole,
      })
      setInviteInput("")
      setInviteStatus({
        tone: "success",
        message: t("org.inviteSent"),
      })
    } catch (error) {
      setInviteStatus({
        tone: "error",
        message: getErrorMessage(error, t("org.inviteSendError")),
      })
    } finally {
      setIsInviting(false)
    }
  }

  return (
    <div className="h-16 px-6 flex items-center justify-between border-b border-border bg-bg-base">
      {/* Left side - Logo/Breadcrumbs could go here if needed */}
      <div className="flex items-center">
        <span className="font-bold text-xl tracking-tight">miro</span>
        <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-500/10 text-yellow-500 rounded border border-yellow-500/20">Free</span>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-4">
        <Dialog
          open={isInviteOpen}
          onOpenChange={(nextOpen) => {
            setIsInviteOpen(nextOpen)
            if (!nextOpen) {
              setInviteStatus(null)
              setInviteInput("")
              setInviteRole("member")
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 hidden sm:flex"
              disabled={!currentOrganization}
            >
              <UserPlus className="w-4 h-4" />
              {t("org.inviteMembersTitle")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>{t("org.inviteMembersTitle")}</DialogTitle>
              <DialogDescription>
                {t("org.inviteMembersSubtitle")}
              </DialogDescription>
            </DialogHeader>

            {inviteStatus && (
              <div
                className={
                  inviteStatus.tone === "success"
                    ? "rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"
                    : "rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
                }
              >
                {inviteStatus.message}
              </div>
            )}

            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="topbar_invite_email">{t("org.inviteEmailLabel")}</Label>
                <Input
                  id="topbar_invite_email"
                  value={inviteInput}
                  onChange={(event) => setInviteInput(event.target.value)}
                  placeholder={t("org.inviteEmailPlaceholder")}
                  className="bg-bg-base border-border"
                  disabled={!currentOrganization || isInviting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topbar_invite_role">{t("org.inviteRoleLabel")}</Label>
                <select
                  id="topbar_invite_role"
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(event.target.value as OrganizationRole)
                  }
                  className="h-10 w-full rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50"
                  disabled={!currentOrganization || isInviting}
                >
                  <option value="member">{t("org.roleMember")}</option>
                  <option value="admin">{t("org.roleAdmin")}</option>
                  <option value="guest">{t("org.roleGuest")}</option>
                </select>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsInviteOpen(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={!currentOrganization || isInviting}>
                  {isInviting ? t("org.inviteSending") : t("org.inviteSend")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        
        <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white hidden sm:flex">
          Upgrade
        </Button>

        <div className="h-6 w-px bg-border mx-2 hidden sm:block" />

        <div className="flex items-center gap-2">
          <Button aria-label={t("nav.whatsNew")} variant="ghost" size="sm" className="w-9 h-9 p-0 rounded-full">
            <Gift className="w-5 h-5 text-text-secondary" />
          </Button>
          <Button aria-label={t("nav.notifications")} variant="ghost" size="sm" className="w-9 h-9 p-0 rounded-full">
            <Bell className="w-5 h-5 text-text-secondary" />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full ml-2">
                <Avatar className="h-9 w-9 border border-border">
                  <AvatarImage src={user?.avatar_url || ''} alt={displayName} />
                  <AvatarFallback className="bg-blue-500 text-white">{avatarFallback}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-surface border-border text-text-primary" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{displayName}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onSelect={() => navigate({ to: "/profile" })}
                className="focus:bg-elevated cursor-pointer"
              >
                {t("nav.profile")}
              </DropdownMenuItem>
              <DropdownMenuItem className="focus:bg-elevated cursor-pointer">
                {t("nav.settings")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem onClick={handleLogout} className="text-red-400 focus:text-red-400 focus:bg-red-500/10 cursor-pointer">
                {t("nav.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

function parseEmails(value: string) {
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function getErrorMessage(error: unknown, fallback: string) {
  return getApiErrorMessage(error, fallback)
}
