import React, { useState, useEffect } from 'react';
import { AUTH_TOKEN_KEY } from '../../utils/constants';

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
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#0b1120',
        width: '100vw',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(-20px, -60px) rotate(-3deg); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(30px, -40px) rotate(4deg); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .login-input:focus {
          border-color: #3b82f6 !important;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18) !important;
        }
        .login-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 25px rgba(59, 130, 246, 0.45) !important;
        }
        .login-btn:active {
          transform: translateY(0);
        }
        .feature-item:hover {
          background: rgba(255,255,255,0.08) !important;
          transform: translateX(4px);
        }
      `}</style>

      {/* Main Card Container */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          maxWidth: '1100px',
          minHeight: '640px',
          maxHeight: '90vh',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.06)',
          position: 'relative',
        }}
      >
        {/* Left Branding Panel */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '3rem',
            position: 'relative',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
            borderRadius: '16px 0 0 16px',
          }}
        >
          {/* Animated Orbs */}
          <div
            style={{
              position: 'absolute',
              top: '10%',
              left: '15%',
              width: '280px',
              height: '280px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
              animation: 'float1 18s ease-in-out infinite',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '15%',
              right: '10%',
              width: '240px',
              height: '240px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
              animation: 'float2 22s ease-in-out infinite',
              pointerEvents: 'none',
            }}
          />

          <div style={{ position: 'relative', zIndex: 1, maxWidth: '520px', animation: 'fadeInUp 0.8s ease' }}>
            {/* Logo and System Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2.5rem' }}>
              {logo ? (
                logo
              ) : (
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #a855f7 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '1.25rem',
                    boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)',
                  }}
                >
                  {systemName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.5px' }}>
                  {systemName}
                </h1>
                <span style={{ fontSize: '0.75rem', color: '#64748b', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  {systemSubtitle}
                </span>
              </div>
            </div>

            <h2
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                lineHeight: 1.3,
                margin: '0 0 1rem',
                background: 'linear-gradient(135deg, #f1f5f9 0%, #94a3b8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              安全 · 可靠 · 敏捷<br />一站式研发基础设施
            </h2>

            <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: 1.6, margin: '0 0 2rem' }}>
              {systemDesc}
            </p>

            {/* Feature Badges */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {defaultFeatures.map((feat, idx) => (
                <div
                  key={idx}
                  className="feature-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(8px)',
                    transition: 'all 0.25s ease',
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: 'rgba(59,130,246,0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={feat.icon} />
                    </svg>
                  </div>
                  <div>
                    <div style={{ color: '#e2e8f0', fontSize: '0.88rem', fontWeight: 600 }}>{feat.title}</div>
                    <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '2px' }}>{feat.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Login Form Panel */}
        <div
          style={{
            flex: '0 0 440px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '3rem 2.5rem',
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(20px)',
            position: 'relative',
          }}
        >
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', fontWeight: 700, color: '#f8fafc' }}>
              账号登录
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              请使用企业 SSO 账号或系统分配账号进入系统
            </p>
          </div>

          {error && (
            <div
              style={{
                marginBottom: '1.5rem',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
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
                className="login-btn"
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  border: 'none',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem',
                  boxShadow: '0 4px 15px rgba(37, 99, 235, 0.35)',
                  transition: 'all 0.2s ease',
                }}
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                margin: '1rem 0 1.5rem',
                color: '#475569',
                fontSize: '0.8rem',
              }}
            >
              <div style={{ flex: 1, height: '1px', background: '#334155' }} />
              <button
                type="button"
                onClick={() => setShowPasswordForm(!showPasswordForm)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                {showPasswordForm ? '收起密码登录' : '使用账号密码登录'}
              </button>
              <div style={{ flex: 1, height: '1px', background: '#334155' }} />
            </div>
          )}

          {/* Password Login Form */}
          {authConfig?.password_login_enabled && showPasswordForm && (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                  邮箱 / 账号
                </label>
                <input
                  className="login-input"
                  required
                  type="text"
                  placeholder="如: admin@code-shield.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'all 0.2s ease',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                  密码
                </label>
                <input
                  className="login-input"
                  required
                  type="password"
                  placeholder="请输入登录密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'all 0.2s ease',
                  }}
                />
              </div>

              <button
                type="submit"
                className="login-btn"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  borderRadius: '10px',
                  background: loading ? '#475569' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
                  transition: 'all 0.2s ease',
                }}
              >
                {loading ? '正在验证...' : '登 录'}
              </button>
            </form>
          )}

          <div style={{ marginTop: '2rem', textAlign: 'center', color: '#475569', fontSize: '0.75rem' }}>
            © {new Date().getFullYear()} Code Platform. 保留所有权利.
          </div>
        </div>
      </div>
    </div>
  );
};
