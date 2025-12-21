import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/Button";
import {
  Users,
  Maximize,
  Share2,
  Zap,
  Shield,
  MousePointer2,
} from "lucide-react";
import { FeatureCard } from "@/components/landing/FeatureCard";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const token = localStorage.getItem("token");
    if (token) {
      throw redirect({
        to: "/dashboard",
      });
    }
  },
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-body">
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-sm text-yellow-500 mb-8 animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
            </span>
            Now in Public Beta
          </div>

          <h1 className="font-heading text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-white">
            Collaborate in Real-Time,
            <br />
            <span className="text-yellow-500">Create Without Limits</span>
          </h1>

          <p className="text-lg md:text-xl text-neutral-400 max-w-3xl mx-auto mb-10 leading-relaxed">
            A powerful, open-source whiteboard for teams to brainstorm, plan,
            and design together. Experience infinite canvas with zero latency.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="w-full sm:w-auto text-base font-semibold shadow-lg shadow-yellow-500/20"
            >
              Get Started - It's Free
            </Button>
          </div>
        </div>

        {/* Abstract Background Elements */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none opacity-20">
          <div className="absolute top-1/4 left-10 w-64 h-64 bg-yellow-500 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-1/4 right-10 w-64 h-64 bg-blue-500 rounded-full blur-[120px]"></div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-neutral-900">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">
              Everything you need
            </h2>
            <p className="text-neutral-400 max-w-2xl mx-auto">
              Built with performance and collaboration in mind.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {/* Feature 1 */}
            <FeatureCard
              icon={<Users className="w-6 h-6 text-yellow-500" />}
              title="Real-time Collaboration"
              description="See others' cursors and changes instantly. Built on CRDTs for conflict-free editing."
            />

            {/* Feature 2 */}
            <FeatureCard
              icon={<Maximize className="w-6 h-6 text-yellow-500" />}
              title="Infinite Canvas"
              description="Never run out of space. Pan and zoom freely across an limitless workspace."
            />

            {/* Feature 3 */}
            <FeatureCard
              icon={<Zap className="w-6 h-6 text-yellow-500" />}
              title="High Performance"
              description="Powered by Rust and WebAssembly for butter-smooth rendering at 60fps."
            />

            {/* Feature 4 */}
            <FeatureCard
              icon={<Share2 className="w-6 h-6 text-yellow-500" />}
              title="Easy Sharing"
              description="Share your board with a simple link. Control permissions for viewing and editing."
            />

            {/* Feature 5 */}
            <FeatureCard
              icon={<Shield className="w-6 h-6 text-yellow-500" />}
              title="Secure by Design"
              description="End-to-end encryption ready. Your ideas stay yours."
            />

            {/* Feature 6 */}
            <FeatureCard
              icon={<MousePointer2 className="w-6 h-6 text-yellow-500" />}
              title="Multi-player Cursors"
              description="Feel the presence of your team with smooth, real-time multiplayer cursors."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 border-t border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-bold mb-6">
            Ready to start collaborating?
          </h2>
          <p className="text-neutral-400 mb-8 text-lg">
            Join thousands of teams who are already using our whiteboard to
            visualize their ideas.
          </p>
          <Button
            size="lg"
            className="px-8 text-base"
            onClick={() => navigate({ to: "/register" })}
          >
            Create a Free Board
          </Button>
        </div>
      </section>
    </div>
  );
}
