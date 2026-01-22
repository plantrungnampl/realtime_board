import { createFileRoute, Link, useNavigate, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { Eye, EyeOff } from "lucide-react";
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useAppStore } from '@/store/useAppStore'

type LoginSearch = {
  redirect?: string
  email?: string
}

export const Route = createFileRoute('/login')({
  beforeLoad: ({ location }) => {
    const token = localStorage.getItem('token')
    if (token) {
      const search = location.search as Record<string, unknown> | undefined
      const redirectTarget = resolveRedirectTarget(
        typeof search?.redirect === 'string' ? search.redirect : undefined,
      )
      const email = typeof search?.email === 'string' ? search.email : undefined
      throw redirect({
        to: redirectTarget,
        search: buildRedirectSearch(redirectTarget, email),
      })
    }
  },
  component: Login,
})

function Login() {
  const navigate = useNavigate();
  const login = useAppStore((state) => state.login);
  const isLoading = useAppStore((state) => state.isLoading);
  const error = useAppStore((state) => state.error);
  const search = Route.useSearch() as LoginSearch;
  const redirectTarget = resolveRedirectTarget(search.redirect);

  const [email, setEmail] = useState(() => search.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await login({ email, password });
      navigate({
        to: redirectTarget,
        search: buildRedirectSearch(redirectTarget, search.email),
      });
    } catch (error) {
      console.warn("login failed", error);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 px-4 font-body">
      <div className="w-full max-w-md space-y-8 p-8 bg-neutral-800 rounded-xl border border-neutral-700">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-neutral-200 font-heading">
            Welcome back
          </h2>
          <p className="mt-2 text-sm text-neutral-400">
            Sign in to your account to continue
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md">
              {error}
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
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                required
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-primary"
                aria-label={showPassword ? "Hide password" : "Show password"}
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
          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <div className="text-center text-sm text-neutral-400">
          Don&apos;t have an account?{" "}
          <Link
            to="/register"
            search={{
              email: search.email,
              redirect: search.redirect,
            }}
            className="text-yellow-500 hover:text-yellow-400 font-medium hover:underline underline-offset-4"
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}

function resolveRedirectTarget(value?: string) {
  if (!value) return "/dashboard";
  if (!value.startsWith("/")) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  return value;
}

function buildRedirectSearch(target: string, email?: string) {
  if (target === "/invitations" && email && email.trim()) {
    return { email: email.trim() };
  }
  return undefined;
}
