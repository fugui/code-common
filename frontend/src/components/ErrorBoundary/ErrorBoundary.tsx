import React from 'react';

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
        <div style={{
          padding: '2.5rem', background: 'var(--card-bg, #1e293b)', borderRadius: '12px',
          border: '1px solid #ef4444', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: '1.25rem', maxWidth: '500px', margin: '4rem auto', textAlign: 'center'
        }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: '24px', fontWeight: 'bold' }}>
            !
          </div>
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-color, #f8fafc)' }}>
              {this.props.title || '模块加载失败'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5 }}>
              {this.props.description || '无法正常加载当前视图模块。这可能是由于服务断开或网络连接问题导致的。'}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1.25rem',
              background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px',
              fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', transition: 'background-color 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            🔄 重试加载
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
