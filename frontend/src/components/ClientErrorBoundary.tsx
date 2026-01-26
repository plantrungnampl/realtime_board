import React from "react";

import { Button } from "@/components/ui/Button";
import { clientLogger } from "@/lib/logger";

type ClientErrorBoundaryProps = {
  children: React.ReactNode;
};

type ClientErrorBoundaryState = {
  hasError: boolean;
};

export class ClientErrorBoundary extends React.Component<
  ClientErrorBoundaryProps,
  ClientErrorBoundaryState
> {
  state: ClientErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ClientErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    clientLogger.error(
      "React render error",
      { component_stack: info.componentStack },
      error,
    );
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-neutral-900 text-neutral-100 flex items-center justify-center px-6">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-neutral-400">
              We hit an unexpected error. Please refresh the page.
            </p>
            <Button type="button" onClick={this.handleReload} className="w-full">
              Reload
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
