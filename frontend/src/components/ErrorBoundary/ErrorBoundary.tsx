import React from 'react';
import './error-boundary.css';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  title?: string;
  description?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="code-error-boundary-card">
          <div className="code-error-boundary-icon-box">
            !
          </div>
          <div>
            <h3 className="code-error-boundary-title">
              {this.props.title || '模块加载失败'}
            </h3>
            <p className="code-error-boundary-desc">
              {this.props.description || '无法正常加载当前视图模块。这可能是由于服务断开或网络连接问题导致的。'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="code-error-boundary-btn-retry"
          >
            🔄 重试加载
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
