"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#ef444420" }}>
            <svg className="w-6 h-6" fill="none" stroke="#ef4444" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-sm font-medium" style={{ color: "#f0f0f0" }}>
            {this.props.fallbackMessage || "Something went wrong"}
          </p>
          <p className="text-xs" style={{ color: "#666" }}>
            {this.state.error?.message}
          </p>
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "#ea580c", color: "#fff" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#f97316"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#ea580c"}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
