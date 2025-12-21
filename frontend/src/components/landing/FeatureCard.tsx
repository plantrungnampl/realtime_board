import React from 'react'

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="p-6 rounded-xl bg-neutral-800 border border-neutral-700 hover:border-yellow-500/50 transition-colors group">
      <div className="w-12 h-12 rounded-lg bg-neutral-900 flex items-center justify-center mb-4 border border-neutral-700 group-hover:border-yellow-500/30 transition-colors">
        {icon}
      </div>
      <h3 className="font-heading text-xl font-semibold mb-2 text-neutral-200">{title}</h3>
      <p className="text-neutral-400 leading-relaxed text-sm">
        {description}
      </p>
    </div>
  )
}
