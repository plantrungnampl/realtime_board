import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="p-2 text-lg">Hello from About!</div>
    </div>
  )
}
