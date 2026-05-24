import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Route render failed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-lg rounded-sm border border-status-error/30 bg-bg-surface p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-error" />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-light text-fg">
                This view crashed
              </h1>
              <p className="mt-2 text-sm text-fg-muted">
                The app window is still running. Reload this view, or move to
                another section from the sidebar.
              </p>
              <pre className="mt-3 max-h-32 overflow-auto rounded-sm border border-border bg-bg-base/60 p-3 text-xs text-status-error whitespace-pre-wrap">
                {this.state.error.message}
              </pre>
              <Button
                className="mt-4"
                variant="gold"
                size="sm"
                onClick={() => this.setState({ error: null })}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reload view
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
