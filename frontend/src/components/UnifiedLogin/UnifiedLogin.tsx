import React, { useState, useEffect } from 'react';
import { AUTH_TOKEN_KEY } from '../../utils/constants';
import './unified-login.css';

export interface AuthFeatureItem {
  icon: string;
  title: string;
  desc: string;
}

export interface UnifiedLoginProps {
  systemName: string;
  systemSubtitle?: string;
  systemDesc?: string;
  logo?: React.ReactNode;
  features?: AuthFeatureItem[];
  apiPrefix?: string;
  tokenKey?: string;
  onLoginSuccess?: () => void;
}

interface AuthConfigResponse {
  oauth2_enabled: boolean;
  password_login_enabled: boolean;
  dept_api_url?: string;
}

export const UnifiedLogin: React.FC<UnifiedLoginProps> = ({
  systemName,
  systemSubtitle = '企业级研发效能与安全体系',
  systemDesc = '打造高可靠、高可用、高安全的企业级研发协作基础设施',
  logo,
  features,
  apiPrefix = '',
  tokenKey = AUTH_TOKEN_KEY,
  onLoginSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfigResponse | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const cleanPrefix = apiPrefix.endsWith('/') ? apiPrefix.slice(0, -1) : apiPrefix;
  const authConfigUrl = `${cleanPrefix}/api/auth/config`;
  const loginUrl = `${cleanPrefix}/api/login`;
  const ssoAuthorizeUrl = `${cleanPrefix}/api/oauth2/authorize`;

  const defaultFeatures: AuthFeatureItem[] = features || [
    {
      icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
      title: '统一单点登录 (SSO)',
      desc: '支持企业级 OAuth2/OIDC 认证协议与零信任安全策略',
    },
    {
      icon: 'M13 10V3L4 14h7v7l9-11h-7z',
      title: '高效协同与安全管控',
      desc: '提供细粒度权限模型与毫秒级即时响应能力',
    },
    {
      icon: 'M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7zm4 4h8m-8 4h5',
      title: '全流程审计追溯',
      desc: '全链路执行审计日志与精细化安全合规防护',
    },
  ];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ssoError = params.get('sso_error');
    if (ssoError) {
      setError(ssoError);
      sessionStorage.setItem('sso_error_flag', 'true');
      window.history.replaceState({}, '', window.location.pathname);
    }

    const hasSsoError = ssoError || sessionStorage.getItem('sso_error_flag') === 'true';

    fetch(authConfigUrl, {
      headers: { 'X-Portal-Request': 'true' },
    })
      .then((res) => res.json())
      .then((data: AuthConfigResponse) => {
        setAuthConfig(data);
        if (data.oauth2_enabled && !data.password_login_enabled && !hasSsoError) {
          window.location.href = ssoAuthorizeUrl;
        } else if (!data.oauth2_enabled && data.password_login_enabled) {
          setShowPasswordForm(true);
        }
      })
      .catch(() => {
        setAuthConfig({ oauth2_enabled: false, password_login_enabled: true });
        setShowPasswordForm(true);
      });
  }, [authConfigUrl, ssoAuthorizeUrl]);

  const handleSSOLogin = () => {
    sessionStorage.removeItem('sso_error_flag');
    window.location.href = ssoAuthorizeUrl;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portal-Request': 'true',
      },
      body: JSON.stringify({
        email: email.trim(),
        username: email.trim(),
        password: password.trim(),
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.token) {
          localStorage.setItem(tokenKey, data.token);
          window.dispatchEvent(new Event('auth-change'));
          if (onLoginSuccess) {
            onLoginSuccess();
          } else {
            window.location.href = cleanPrefix || '/';
          }
        } else {
          setError(data.error || '登录失败，可能是账号密码错误或已被禁用');
        }
      })
      .catch(() => setError('网络错误，请稍后重试'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="code-unified-login-page">
      {/* Main Card Container */}
      <div className="code-unified-login-card">
        {/* Left Branding Panel */}
        <div className="code-unified-login-brand-panel">
          {/* Animated Orbs */}
          <div className="code-unified-login-orb-1" />
          <div className="code-unified-login-orb-2" />

          <div className="code-unified-login-brand-content">
            {/* Logo and System Name */}
            <div className="code-unified-login-logo-row">
              {logo ? (
                logo
              ) : (
                <div className="code-unified-login-default-logo">
                  {systemName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="code-unified-login-system-title">
                  {systemName}
                </h1>
                <span className="code-unified-login-system-sub">
                  {systemSubtitle}
                </span>
              </div>
            </div>

            <h2 className="code-unified-login-brand-slogan">
              安全 · 可靠 · 敏捷<br />一站式研发基础设施
            </h2>

            <p className="code-unified-login-brand-desc">
              {systemDesc}
            </p>

            {/* Feature Badges */}
            <div className="code-unified-login-features-list">
              {defaultFeatures.map((feat, idx) => (
                <div key={idx} className="code-unified-login-feature-item">
                  <div className="code-unified-login-feature-icon-box">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-primary, #3b82f6)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={feat.icon} />
                    </svg>
                  </div>
                  <div>
                    <div className="code-unified-login-feature-title">{feat.title}</div>
                    <div className="code-unified-login-feature-desc">{feat.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Login Form Panel */}
        <div className="code-unified-login-form-panel">
          <div className="code-unified-login-form-header">
            <h3 className="code-unified-login-form-title">
              账号登录
            </h3>
            <p className="code-unified-login-form-subtitle">
              请使用企业 SSO 账号或系统分配账号进入系统
            </p>
          </div>

          {error && (
            <div className="code-unified-login-alert-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* SSO Button */}
          {authConfig?.oauth2_enabled && (
            <div style={{ marginBottom: authConfig.password_login_enabled ? '1.5rem' : '0' }}>
              <button
                type="button"
                onClick={handleSSOLogin}
                className="code-unified-login-sso-btn"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                企业 SSO 快捷登录
              </button>
            </div>
          )}

          {/* Divider if both enabled */}
          {authConfig?.oauth2_enabled && authConfig?.password_login_enabled && (
            <div className="code-unified-login-divider-row">
              <div className="code-unified-login-divider-line" />
              <button
                type="button"
                onClick={() => setShowPasswordForm(!showPasswordForm)}
                className="code-unified-login-toggle-btn"
              >
                {showPasswordForm ? '收起密码登录' : '使用账号密码登录'}
              </button>
              <div className="code-unified-login-divider-line" />
            </div>
          )}

          {/* Password Login Form */}
          {authConfig?.password_login_enabled && showPasswordForm && (
            <form onSubmit={handleSubmit}>
              <div className="code-unified-login-form-group">
                <label className="code-unified-login-label">
                  邮箱 / 账号
                </label>
                <input
                  required
                  type="text"
                  placeholder="如: admin@code-shield.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="code-unified-login-input"
                />
              </div>

              <div className="code-unified-login-form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="code-unified-login-label">
                  密码
                </label>
                <input
                  required
                  type="password"
                  placeholder="请输入登录密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="code-unified-login-input"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="code-unified-login-submit-btn"
              >
                {loading ? '正在验证...' : '登 录'}
              </button>
            </form>
          )}

          <div className="code-unified-login-footer-copy">
            © {new Date().getFullYear()} Code Platform. 保留所有权利.
          </div>
        </div>
      </div>
    </div>
  );
};
