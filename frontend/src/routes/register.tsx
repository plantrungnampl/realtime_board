import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
  redirect,
} from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useAppStore } from '@/store/useAppStore'
import { validateOrganizationInvite } from '@/features/organizations/api'
import type { InviteValidationResponse } from '@/features/organizations/types'
import { getApiErrorMessage } from '@/shared/api/errors'

type RegisterSearch = {
  email?: string
  invite?: string
  token?: string
  redirect?: string
}

export const Route = createFileRoute('/register')({
  beforeLoad: ({ location }) => {
    if (location.pathname.startsWith('/register/setup')) {
      return
    }
    const token = localStorage.getItem('token')
    if (token) {
      throw redirect({
        to: '/dashboard',
      })
    }
  },
  component: Register,
})

function Register() {
  const location = useLocation()
  const navigate = useNavigate()
  const register = useAppStore((state) => state.register)
  const isLoading = useAppStore((state) => state.isLoading)
  const error = useAppStore((state) => state.error)
  const search = Route.useSearch() as RegisterSearch

  const [localError, setLocalError] = useState<string | null>(null)
  const [email, setEmail] = useState(() => search.email ?? '')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const rawInviteToken =
    typeof search.invite === 'string'
      ? search.invite
      : typeof search.token === 'string'
        ? search.token
        : ''
  const inviteToken = rawInviteToken.trim()
  const inviteEmail = typeof search.email === 'string' ? search.email.trim() : ''
  const isInviteFlow = Boolean(inviteToken && inviteEmail)
  const isEmailLocked = isInviteFlow
  type InviteStatus =
    | { state: 'idle' | 'loading' }
    | { state: 'valid'; data: InviteValidationResponse }
    | { state: 'invalid'; message: string }
  const inviteQuery = useQuery<InviteValidationResponse, unknown>({
    queryKey: ['organizationInviteValidation', inviteToken, inviteEmail],
    queryFn: () => validateOrganizationInvite(inviteToken, inviteEmail),
    enabled: isInviteFlow,
  })
  const inviteStatus: InviteStatus = (() => {
    if (!isInviteFlow) return { state: 'idle' }
    if (inviteQuery.isLoading) return { state: 'loading' }
    if (inviteQuery.data) return { state: 'valid', data: inviteQuery.data }
    if (inviteQuery.isError) {
      return {
        state: 'invalid',
        message: getApiErrorMessage(
          inviteQuery.error,
          'This invitation is invalid or has expired.',
        ),
      }
    }
    return { state: 'idle' }
  })()
  const isInviteValid = inviteStatus.state === 'valid'
  const isInviteLoading = inviteStatus.state === 'loading'

  function validateInputs() {
    const trimmedEmail = email.trim()
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
    if (!emailOk) {
      return 'Email format is invalid'
    }
    const trimmedUsername = username.trim()
    const usernameOk = /^[a-zA-Z0-9_]{3,20}$/.test(trimmedUsername)
    if (!usernameOk) {
      return 'Username must be 3-20 characters and use letters, numbers, or underscores'
    }
    const passwordOk = password.length >= 8 && /[A-Z]/.test(password) && /\d/.test(password)
    if (!passwordOk) {
      return 'Password must be at least 8 characters and include 1 uppercase letter and 1 number'
    }
    return null
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isInviteFlow && !isInviteValid) {
      const message =
        inviteStatus.state === 'invalid'
          ? inviteStatus.message
          : 'Please wait for the invitation to be validated.'
      setLocalError(message)
      return
    }
    const validationError = validateInputs()
    if (validationError) {
      setLocalError(validationError)
      return
    }
    try {
      const normalizedEmail = email.trim()
      const normalizedUsername = username.trim()
      await register({
        email: normalizedEmail,
        username: normalizedUsername,
        display_name: displayName,
        password_hash: password,
        invite_token: isInviteValid ? inviteToken : undefined,
      })
      navigate({ to: '/register/setup' })
    } catch (error) {
      console.warn("register failed", error)
    }
  }

  if (location.pathname.startsWith('/register/setup')) {
    return <Outlet />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 px-4 font-body">
      <div className="w-full max-w-md space-y-8 p-8 bg-neutral-800 rounded-xl border border-neutral-700">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-neutral-200 font-heading">Create an account</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Enter your details below to create your account
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          {(localError || error) && (
            <div
              role="alert"
              className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md"
            >
              {localError || error}
            </div>
          )}
          {isInviteFlow && (
            <div className="p-3 text-sm text-neutral-300 bg-neutral-900/60 border border-neutral-700 rounded-md space-y-1">
              {isInviteLoading && <div>Validating invitation...</div>}
              {inviteStatus.state === 'invalid' && (
                <div className="text-red-400">{inviteStatus.message}</div>
              )}
              {isInviteValid && (
                <>
                  <div>
                    You&apos;re invited to{" "}
                    <span className="font-medium">
                      {inviteStatus.data.organization.name}
                    </span>{" "}
                    as{" "}
                    <span className="font-medium">
                      {formatRole(inviteStatus.data.role)}
                    </span>
                    .
                  </div>
                  <div className="text-neutral-400">
                    This invite was sent to{" "}
                    <span className="font-medium">{inviteEmail}</span>. Sign up
                    with the same email to accept it.
                  </div>
                </>
              )}
              {!isInviteLoading &&
                inviteStatus.state !== 'invalid' &&
                !isInviteValid && (
                <div>
                  This invite was sent to{" "}
                  <span className="font-medium">{inviteEmail}</span>. Sign up
                  with the same email to accept it.
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              placeholder="m@example.com"
              required
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              value={email}
              readOnly={isEmailLocked}
              onChange={(event) => {
                if (isEmailLocked) return
                if (localError) setLocalError(null)
                setEmail(event.target.value)
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              placeholder="johndoe"
              required
              type="text"
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect="off"
              value={username}
              onChange={(event) => {
                if (localError) setLocalError(null)
                setUsername(event.target.value)
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="display_name">Display Name</Label>
            <Input
              id="display_name"
              placeholder="John Doe"
              required
              type="text"
              autoCapitalize="words"
              autoComplete="name"
              autoCorrect="off"
              value={displayName}
              onChange={(event) => {
                if (localError) setLocalError(null)
                setDisplayName(event.target.value)
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                required
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => {
                  if (localError) setLocalError(null)
                  setPassword(event.target.value)
                }}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 rounded-sm"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <Button
            className="w-full"
            type="submit"
            isLoading={isLoading || isInviteLoading}
            disabled={isInviteFlow && !isInviteValid}
          >
            {isInviteLoading
              ? 'Validating invite...'
              : isLoading
                ? 'Creating account...'
                : 'Sign Up'}
          </Button>
        </form>

        <div className="text-center text-sm text-neutral-400">
          Already have an account?{" "}
          <Link
            to="/login"
            search={{
              email: search.email,
              redirect: search.redirect,
            }}
            className="text-yellow-500 hover:text-yellow-400 font-medium hover:underline underline-offset-4"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}

function formatRole(role: string) {
  if (!role) return role
  return role.charAt(0).toUpperCase() + role.slice(1)
}
