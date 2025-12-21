import React from 'react'

interface FaqItemProps {
  question: string
  answer: string
}

export function FaqItem({ question, answer }: FaqItemProps) {
  return (
    <div className="border-b border-border pb-6 last:border-0">
      <h4 className="font-heading text-lg font-semibold mb-2 text-neutral-200">{question}</h4>
      <p className="text-text-secondary leading-relaxed">{answer}</p>
    </div>
  )
}
