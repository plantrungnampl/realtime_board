import { Button } from '@/components/ui/Button'
import { Check } from 'lucide-react'

interface PricingCardProps {
  name: string
  price: string
  period?: string
  description: string
  features: string[]
  highlights?: Array<{ label: string; value: string }>
  isPopular?: boolean
  buttonText: string
  variant?: "default" | "secondary" | "ghost" | "link"
}

export function PricingCard({ 
  name, 
  price, 
  period = "", 
  description, 
  features, 
  highlights = [],
  isPopular = false,
  buttonText,
  variant = "default"
}: PricingCardProps) {
  return (
    <div className={`relative p-8 rounded-2xl border flex flex-col h-full transition-all duration-200 ${isPopular ? 'bg-neutral-800/50 border-yellow-500 shadow-lg shadow-yellow-500/10' : 'bg-surface border-border hover:border-neutral-600'}`}>
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-yellow-500 text-neutral-900 text-sm font-bold rounded-full shadow-md">
          Most Popular
        </div>
      )}
      
      <div className="mb-6">
        <h3 className="font-heading text-xl font-semibold mb-2">{name}</h3>
        <div className="flex items-baseline gap-1 mb-4">
          <span className="text-4xl font-bold text-white">{price}</span>
          {period && <span className="text-text-secondary">{period}</span>}
        </div>
        <p className="text-text-secondary text-sm leading-relaxed">{description}</p>
      </div>

      {highlights.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {highlights.map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-bg-base px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-text-muted">
                {item.label}
              </div>
              <div className="text-sm font-semibold text-text-primary">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 mb-8">
        <ul className="space-y-4">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3 text-sm text-neutral-300">
              <Check className="w-5 h-5 text-yellow-500 shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <Button variant={variant} className="w-full font-semibold">
        {buttonText}
      </Button>
    </div>
  )
}
