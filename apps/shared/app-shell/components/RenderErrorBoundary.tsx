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
    console.error('RenderErrorBoundary caught a renderer error:', error);
  }

  private handleTryRenderAgain = () => {
    this.setState({
      hasError: false,
      errorMessage: '',
    });
  };

  private handleReloadApp = () => {
    window.location.reload();
  };

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
          <div className="game-card__actions" style={{ marginTop: 12 }}>
            <button type="button" className="button" onClick={this.handleTryRenderAgain}>
              Try rendering again
            </button>
            <button type="button" className="button button--icon" onClick={this.handleReloadApp}>
              Reload app
            </button>
          </div>
          <p>Open DevTools with F12 or Ctrl+Shift+I to inspect details.</p>
        </section>
      </main>
    );
  }
}
