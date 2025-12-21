import { createFileRoute, Link, useNavigate, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useAppStore } from '@/store/useAppStore'

export const Route = createFileRoute('/register')({
  beforeLoad: () => {
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
  const navigate = useNavigate()
  const register = useAppStore((state) => state.register)
  const isLoading = useAppStore((state) => state.isLoading)
  const error = useAppStore((state) => state.error)

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await register({ 
        email, 
        username, 
        display_name: displayName, 
        password_hash: password 
      })
      navigate({ to: '/dashboard' })
    } catch (e) {
      // Error handled in store
    }
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
              onChange={(e) => setUsername(e.target.value)}
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
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              required
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading ? "Creating account..." : "Sign Up"}
          </Button>
        </form>

        <div className="text-center text-sm text-neutral-400">
          Already have an account?{" "}
          <Link to="/login" className="text-yellow-500 hover:text-yellow-400 font-medium hover:underline underline-offset-4">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}