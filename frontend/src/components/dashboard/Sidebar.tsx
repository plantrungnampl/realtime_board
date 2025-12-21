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

export function Sidebar() {
  const navItems = [
    { icon: Home, label: 'Home', active: true },
    { icon: Clock, label: 'Recent', active: false },
    { icon: Star, label: 'Starred', active: false },
  ]

  return (
    <div className="w-64 border-r border-border bg-bg-base flex flex-col h-full">
      {/* Team Switcher */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-bg-surface cursor-pointer transition-colors group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center text-neutral-900 font-bold text-sm">
              TE
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-text-muted">Team</span>
              <span className="text-sm font-semibold text-text-primary">test</span>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-text-secondary group-hover:text-text-primary" />
        </div>
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