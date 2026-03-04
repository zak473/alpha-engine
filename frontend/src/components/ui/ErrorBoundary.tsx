"use client";

import { Component, ErrorInfo, ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { TriangleAlert } from "lucide-react";
import { Button } from "./Button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  retry = () => this.setState({ hasError: false, message: "" });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <EmptyState
          icon={TriangleAlert}
          title="Something went wrong"
          description={this.state.message || "An unexpected error occurred in this section."}
          action={
            <Button variant="ghost" size="sm" onClick={this.retry}>
              Retry
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
