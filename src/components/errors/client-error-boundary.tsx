"use client";

import {
  Component,
  Fragment,
  type ErrorInfo,
  type ReactNode,
} from "react";

import { ConnectionFallback } from "@/components/ui/connection-fallback";
import { ErrorPanel } from "@/components/ui/error-panel";
import { isConnectionError, isOffline } from "@/lib/errors/connection";

type ClientErrorBoundaryProps = {
  children: ReactNode;
  /**
   * Shown for a genuine rendering defect. The default is a neutral retry panel;
   * pass a domain title so the message names the surface that failed.
   */
  title?: string;
  description?: string;
  /** Rendered when the failure is a dropped connection, not a code bug. */
  connectionTitle?: string;
  /** Retry hook for the parent (e.g. re-run a fetch); defaults to a re-render. */
  onRetry?: () => void;
};

type ClientErrorBoundaryState = {
  error: Error | null;
  /** Bumped on retry so the child subtree remounts instead of reusing state. */
  attempt: number;
};

/**
 * Error boundary for a single client island.
 *
 * Next's route-level `error.tsx` protects a whole segment; this protects one
 * widget inside it so a crash in, say, the Field Ops board does not also take
 * out the shell, the topbar or the city map. It deliberately distinguishes a
 * connection drop from a rendering defect: the former offers "reconnecting"
 * and auto-retries when the network returns, the latter a plain retry.
 */
export class ClientErrorBoundary extends Component<
  ClientErrorBoundaryProps,
  ClientErrorBoundaryState
> {
  state: ClientErrorBoundaryState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<ClientErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Connection noise is already surfaced by the fallback; only log defects so
    // a flaky network does not flood the console with stack traces.
    if (!isConnectionError(error) && !isOffline()) {
      console.error(error, info.componentStack);
    }
  }

  private reset = () => {
    this.props.onRetry?.();
    this.setState((previous) => ({
      error: null,
      attempt: previous.attempt + 1,
    }));
  };

  render() {
    const { error } = this.state;

    if (error) {
      if (isConnectionError(error) || isOffline()) {
        return (
          <ConnectionFallback
            title={this.props.connectionTitle}
            onRetry={this.reset}
          />
        );
      }
      return (
        <ErrorPanel
          error={error}
          reset={this.reset}
          title={this.props.title ?? "تعذر عرض هذا الجزء"}
          description={
            this.props.description ??
            "حدث خطأ غير متوقع أثناء عرض هذه اللوحة. يمكنك إعادة المحاولة دون مغادرة الصفحة."
          }
        />
      );
    }

    // Remount the subtree on retry so stale error state cannot linger.
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
