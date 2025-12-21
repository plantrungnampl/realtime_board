import { Plus, Layout, FileText, GitGraph, GitMerge, Lightbulb, Users, Timer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface TemplateCardProps {
  icon: React.ElementType
  title: string
  color: string
  isBlank?: boolean
}

function TemplateCard({ icon: Icon, title, color, isBlank }: TemplateCardProps) {
  return (
    <div className="flex flex-col gap-2 min-w-[160px] group cursor-pointer">
      <div 
        className={cn(
          "h-[100px] rounded-xl border border-border flex items-center justify-center transition-all duration-200 relative overflow-hidden",
          isBlank 
            ? "bg-bg-surface hover:border-blue-500/50" 
            : "bg-bg-surface hover:border-blue-500/50"
        )}
      >
        {/* Background decorative element for non-blank cards */}
        {!isBlank && (
          <div className={cn("absolute top-0 right-0 w-16 h-16 opacity-10 rounded-bl-full", color)} />
        )}
        
        {isBlank ? (
          <Plus className="w-8 h-8 text-blue-500" />
        ) : (
          <div className={cn("p-3 rounded-lg bg-opacity-10", color.replace('bg-', 'bg-opacity-10 text-'))}>
             <Icon className={cn("w-8 h-8", color.replace('bg-', 'text-'))} />
          </div>
        )}
      </div>
      <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors">
        {title}
      </span>
    </div>
  )
}

export function TemplateGallery() {
  const templates = [
    { icon: Layout, title: 'AI Playground', color: 'bg-purple-500' },
    { icon: FileText, title: 'Prototype', color: 'bg-blue-500' },
    { icon: GitGraph, title: 'Roadmap Planning', color: 'bg-green-500' },
    { icon: GitMerge, title: 'Flowchart', color: 'bg-orange-500' },
    { icon: Timer, title: 'PI Planning', color: 'bg-pink-500' },
    { icon: Lightbulb, title: 'Brainwriting', color: 'bg-yellow-500' },
    { icon: Users, title: 'Customer Journey', color: 'bg-teal-500' },
  ]

  return (
    <div className="py-6">
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
        <TemplateCard icon={Plus} title="Blank board" color="bg-transparent" isBlank />
        {templates.map((template) => (
          <TemplateCard 
            key={template.title} 
            icon={template.icon} 
            title={template.title} 
            color={template.color} 
          />
        ))}
        
        <div className="flex flex-col gap-2 min-w-[160px] items-center justify-center">
            <Button variant="ghost" size="sm" className="text-xs text-text-secondary hover:text-text-primary">
                From Miroverse →
            </Button>
        </div>
      </div>
    </div>
  )
}