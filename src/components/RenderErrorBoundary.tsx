/**
 * Top-level error boundary that prevents silent renderer blank screens.
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

  static override getDerivedStateFromError(error: unknown): RenderErrorBoundaryState {
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
