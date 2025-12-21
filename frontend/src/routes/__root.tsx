import { createRootRouteWithContext, Link, Outlet, useLocation } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { QueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { PenTool, LogOut, User as UserIcon } from 'lucide-react'
import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const checkAuth = useAppStore((state) => state.checkAuth)
  const isAuthenticated = useAppStore((state) => state.isAuthenticated)
  const logout = useAppStore((state) => state.logout)
  const user = useAppStore((state) => state.user)
  const location = useLocation()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const displayName = user?.display_name || user?.username || 'User'
  const avatarFallback = displayName.charAt(0).toUpperCase()

  // Check if we are on the dashboard or board route to hide the header
  const shouldHideHeader = location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/board')

  return (
    <>
      <div className="min-h-screen bg-bg-base text-text-primary font-body flex flex-col">
        {!shouldHideHeader && (
          <nav className="px-4 md:px-6 h-16 flex items-center justify-between border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-50">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2 text-accent font-heading font-bold text-xl tracking-tight hover:opacity-90 transition-opacity">
                <div className="p-1.5 bg-accent/10 rounded-lg">
                  <PenTool className="w-5 h-5" />
                </div>
                RealBoard
              </Link>
              
              <div className="hidden md:flex items-center gap-6 text-sm font-medium text-text-secondary">
                <Link to="/" className="hover:text-text-primary transition-colors">
                  Features
                </Link>
                <Link to="/pricing" className="hover:text-text-primary transition-colors">
                  Pricing
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.avatar_url || ''} alt={displayName} />
                        <AvatarFallback>{avatarFallback}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{displayName}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user?.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <UserIcon className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => logout()}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Link to="/login">
                    <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
                      Log in
                    </Button>
                  </Link>
                  <Link to="/register">
                    <Button size="sm">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        )}
        <main className="flex-1 relative flex flex-col">
          <Outlet />
        </main>
      </div>
      <TanStackRouterDevtools />
      <ReactQueryDevtools />
    </>
  )
}