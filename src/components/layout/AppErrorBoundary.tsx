import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, message: error.message || 'Unexpected interface error.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[AppErrorBoundary]', error, info.componentStack);
    }
  }

  reset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="fatal-shell" role="alert">
        <section className="fatal-card">
          <span className="brand-mark">1</span>
          <div>
            <p className="eyebrow">Interface recovery</p>
            <h1>Something broke in this view.</h1>
            <p className="muted">
              The app caught the error before the full interface crashed. Try reloading this view, then check the browser console if it happens again.
            </p>
          </div>
          <pre className="fatal-message">{this.state.message}</pre>
          <div className="hero-actions">
            <Button type="button" onClick={this.reset}>Try again</Button>
            <Button type="button" variant="secondary" onClick={() => window.location.assign('/dashboard')}>Go to dashboard</Button>
          </div>
        </section>
      </main>
    );
  }
}
