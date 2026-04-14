/**
 * Defensive top-level render boundary for runtime UI failures.
 *
 * Instead of allowing crashes to blank the renderer, this boundary catches
 * render-time errors and presents recoverable feedback to the user. It acts as
 * a safety net for unexpected exceptions in deeply nested component trees and
 * provides a stable fallback surface during refactors.
 *
 * New to this project: this is the renderer safety net; start here to understand how runtime render failures are caught and surfaced instead of blanking the app.
 */
import React from 'react';

type RenderErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

export class RenderErrorBoundary extends React.Component<React.PropsWithChildren, RenderErrorBoundaryState> {
  override state: RenderErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: unknown): RenderErrorBoundaryState {
    const message = error instanceof Error ? error.message : 'Unknown renderer error';
    return {
      hasError: true,
      errorMessage: message,
    };
  }

  override componentDidCatch(error: unknown) {
    // Keep this in console so users can inspect details from devtools when available.
    console.error('RenderErrorBoundary caught a renderer error:', error);
  }

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="shell">
        <section className="panel panel--loading">
          <h2>Renderer crashed</h2>
          <p>The UI hit an unexpected error and could not finish rendering.</p>
          <p>Error: {this.state.errorMessage || 'Unknown error'}</p>
          <p>Open DevTools with F12 or Ctrl+Shift+I to inspect details.</p>
        </section>
      </main>
    );
  }
}






