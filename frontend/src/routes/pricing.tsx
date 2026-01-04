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
            Choose the plan that matches your workspace scale. Limits align with our subscription rules.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
          {/* Free Plan */}
          <PricingCard 
            name="Free"
            price="$0"
            description="For personal work and small experiments."
            highlights={[
              { label: "Members", value: "3" },
              { label: "Boards", value: "5" },
              { label: "Storage", value: "100 MB" },
            ]}
            features={[
              "Up to 500 elements per board",
              "File uploads up to 10 MB",
              "Basic collaboration tools",
              "30-day version history",
              "Community support"
            ]}
            buttonText="Start for Free"
            variant="secondary"
          />

          {/* Pro Plan */}
          <PricingCard 
            name="Starter"
            price="$10"
            period="/user/month"
            description="For small teams coordinating projects."
            highlights={[
              { label: "Members", value: "10" },
              { label: "Boards", value: "25" },
              { label: "Storage", value: "1 GB" },
            ]}
            features={[
              "Up to 2,000 elements per board",
              "File uploads up to 25 MB",
              "90-day version history",
              "Advanced permissions",
              "Export to PDF/PNG"
            ]}
            buttonText="Start Starter"
            variant="secondary"
          />

          {/* Professional Plan */}
          <PricingCard 
            name="Professional"
            price="$20"
            period="/user/month"
            description="For growing teams that need scale."
            highlights={[
              { label: "Members", value: "50" },
              { label: "Boards", value: "Unlimited" },
              { label: "Storage", value: "10 GB" },
            ]}
            features={[
              "Up to 10,000 elements per board",
              "File uploads up to 50 MB",
              "1-year version history",
              "Priority support",
              "Advanced analytics"
            ]}
            isPopular={true}
            buttonText="Get Started"
            variant="default"
          />
        </div>

        {/* Enterprise Plan */}
        <div className="mb-24 max-w-4xl mx-auto">
          <PricingCard 
            name="Enterprise"
            price="Custom"
            description="For large organizations requiring security, governance, and custom SLAs."
            highlights={[
              { label: "Members", value: "Unlimited" },
              { label: "Boards", value: "Unlimited" },
              { label: "Storage", value: "100 GB+" },
            ]}
            features={[
              "Unlimited elements per board",
              "File uploads up to 100 MB",
              "SSO (SAML)",
              "Dedicated support & SLA",
              "On-premise deployment option"
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
