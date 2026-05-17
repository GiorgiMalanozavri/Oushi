"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(`[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ""}]`, error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return <DefaultFallback error={this.state.error} reset={this.reset} label={this.props.label} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({
  error,
  reset,
  label,
}: {
  error: Error;
  reset: () => void;
  label?: string;
}) {
  return (
    <div className="rounded-2xl border border-warning/30 bg-warning-bg/40 dark:bg-warning/10 p-5 my-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-warning/15 p-2 shrink-0">
          <AlertCircle className="w-4 h-4 text-warning" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-warning/80 mb-1">
            Something broke{label ? ` · ${label}` : ""}
          </p>
          <p className="text-[14px] text-text-primary dark:text-white/90 font-medium">
            {error.message || "Unexpected error"}
          </p>
          <p className="mt-1 text-[12px] text-text-muted dark:text-white/50">
            Try again, or refresh the page if this keeps happening.
          </p>
          <button
            onClick={reset}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-warning/15 hover:bg-warning/25 px-3 py-1.5 text-[12px] font-medium text-warning transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
