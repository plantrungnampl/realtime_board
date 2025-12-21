import { createFileRoute } from '@tanstack/react-router'
import { PricingCard } from '@/components/pricing/PricingCard'
import { FaqItem } from '@/components/pricing/FaqItem'

export const Route = createFileRoute('/pricing')({
  component: Pricing,
})

function Pricing() {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-body py-20">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="font-heading text-4xl md:text-5xl font-bold mb-6 text-white">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-neutral-400 leading-relaxed">
            Choose the plan that's right for your team. No hidden fees, cancel anytime.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
          {/* Free Plan */}
          <PricingCard 
            name="Starter"
            price="$0"
            description="For individuals and hobbyists."
            features={[
              "Unlimited public boards",
              "3 private boards",
              "Real-time collaboration",
              "Basic export options",
              "50MB storage"
            ]}
            buttonText="Start for Free"
            variant="secondary"
          />

          {/* Pro Plan */}
          <PricingCard 
            name="Pro"
            price="$12"
            period="/month"
            description="For professional designers and small teams."
            features={[
              "Unlimited private boards",
              "High-res export (PDF, SVG)",
              "Version history (30 days)",
              "Priority support",
              "10GB storage",
              "Custom templates"
            ]}
            isPopular={true}
            buttonText="Get Started"
            variant="default"
          />

          {/* Enterprise Plan */}
          <PricingCard 
            name="Enterprise"
            price="Custom"
            description="For large organizations requiring security & control."
            features={[
              "Everything in Pro",
              "SSO (SAML + Google)",
              "Unlimited version history",
              "Advanced permission management",
              "Dedicated success manager",
              "On-premise deployment options"
            ]}
            buttonText="Contact Sales"
            variant="secondary"
          />
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h2 className="font-heading text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
          <div className="grid gap-8">
            <FaqItem 
              question="Can I cancel my subscription anytime?"
              answer="Yes, you can cancel your subscription at any time. Your access will continue until the end of your current billing period."
            />
            <FaqItem 
              question="Is there a free trial for the Pro plan?"
              answer="We offer a 14-day free trial for the Pro plan. No credit card required to start."
            />
            <FaqItem 
              question="What payment methods do you accept?"
              answer="We accept all major credit cards (Visa, Mastercard, Amex) and PayPal."
            />
            <FaqItem 
              question="Do you offer discounts for students or non-profits?"
              answer="Yes! Contact our support team with proof of status to get a 50% discount on the Pro plan."
            />
          </div>
        </div>

      </div>
    </div>
  )
}
