import { Button } from '@/components/ui/Button'
import { Bell, Gift, UserPlus, ChevronDown } from 'lucide-react'
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
import { useNavigate } from '@tanstack/react-router'

export function TopBar() {
  const user = useAppStore((state) => state.user)
  const logout = useAppStore((state) => state.logout)
  const navigate = useNavigate()

  const displayName = user?.display_name || user?.username || 'User'
  const avatarFallback = displayName.charAt(0).toUpperCase()

  const handleLogout = () => {
    logout()
    navigate({ to: '/login' })
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
        <Button variant="ghost" size="sm" className="gap-2 hidden sm:flex">
          <UserPlus className="w-4 h-4" />
          Invite members
        </Button>
        
        <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white hidden sm:flex">
          Upgrade
        </Button>

        <div className="h-6 w-px bg-border mx-2 hidden sm:block" />

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="w-9 h-9 p-0 rounded-full">
            <Gift className="w-5 h-5 text-text-secondary" />
          </Button>
          <Button variant="ghost" size="sm" className="w-9 h-9 p-0 rounded-full">
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
              <DropdownMenuItem className="focus:bg-elevated cursor-pointer">
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="focus:bg-elevated cursor-pointer">
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem onClick={handleLogout} className="text-red-400 focus:text-red-400 focus:bg-red-500/10 cursor-pointer">
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}