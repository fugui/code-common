import React, { useState, useEffect, useRef } from 'react';
import type { User } from '../../types/user';
import { ROLE_REGISTRY } from '../../utils/roleMeta';
import { Modal } from '../Modal';

export interface UserMenuProps {
  user: User | null;
  onLogout: () => void;
  passwordEndpoint?: string;
  onPasswordChanged?: () => void;
  extraDropdownItems?: React.ReactNode;
}

export const UserMenu: React.FC<UserMenuProps> = ({
  user,
  onLogout,
  passwordEndpoint = '/api/password',
  onPasswordChanged,
  extraDropdownItems,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  if (!user) return null;

  const displayName = user.name || user.email || user.username || 'User';
  const initialChar = displayName.charAt(0).toUpperCase();

  // 解析角色
  let roles: string[] = [];
  if (Array.isArray(user.roles)) {
    roles = user.roles;
  } else if (typeof user.roles === 'string') {
    try {
      roles = JSON.parse(user.roles);
    } catch {
      roles = [];
    }
  }

  const isSuperAdmin = roles.includes('super_admin') || !!user.is_admin;

  let deptName = '';
  if (user.department) {
    if (typeof user.department === 'string') {
      deptName = user.department;
    } else if (typeof user.department === 'object' && user.department.name) {
      deptName = user.department.name;
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordForm.oldPassword) {
      setPasswordError('请输入当前旧密码');
      return;
    }
    if (!passwordForm.newPassword || passwordForm.newPassword.length < 6) {
      setPasswordError('新密码长度不能少于 6 位');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }

    setPasswordSubmitting(true);
    try {
      const res = await fetch(passwordEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_password: passwordForm.oldPassword,
          new_password: passwordForm.newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordSuccess('密码修改成功，即将退出重新登录…');
        setTimeout(() => {
          setShowPasswordModal(false);
          if (onPasswordChanged) {
            onPasswordChanged();
          } else {
            onLogout();
          }
        }, 1500);
      } else {
        setPasswordError(data.error || '修改密码失败');
      }
    } catch {
      setPasswordError('网络请求失败，请稍后重试');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '0.5rem',
          borderRadius: '8px',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-color, rgba(0,0,0,0.05))')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'var(--primary-color, #3b82f6)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: '1rem',
          }}
        >
          {initialChar}
        </div>
        <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-color, #1e293b)' }}>
            {displayName}
          </span>
          {isSuperAdmin ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)', fontWeight: 600 }}>超级管理员</span>
          ) : (
            (() => {
              const matchedRoles = roles
                .map((r) => ROLE_REGISTRY[r])
                .filter(Boolean);
              if (matchedRoles.length > 0) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                    {matchedRoles.map((item, idx) => (
                      <span
                        key={idx}
                        style={{
                          background: item.badgeBg,
                          color: item.badgeColor,
                          padding: '0 4px',
                          borderRadius: 'var(--radius-xs, 3px)',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          lineHeight: '1.2',
                        }}
                      >
                        {item.shortName}
                      </span>
                    ))}
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, var(--color-text-secondary))', marginLeft: '1px' }}>管理员</span>
                  </div>
                );
              }
              return (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, var(--color-text-secondary))' }}>
                  {deptName || '普通成员'}
                </span>
              );
            })()
          )}
        </div>
      </button>

      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.5rem',
            width: '220px',
            backgroundColor: 'var(--card-bg, var(--color-bg-surface))',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: 'var(--shadow-md, 0 10px 25px -5px rgba(0, 0, 0, 0.1))',
            border: '1px solid var(--border-color, var(--color-border-primary))',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color, var(--color-border-primary))' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-color, var(--color-text-primary))' }}>{displayName}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, var(--color-text-secondary))', marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email || user.employee_id || ''}
            </div>
          </div>

          <div style={{ padding: '0.5rem 0' }}>
            {extraDropdownItems}

            <button
              onClick={() => {
                setShowDropdown(false);
                setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
                setPasswordError('');
                setPasswordSuccess('');
                setShowPasswordModal(true);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.625rem 1rem',
                fontSize: '0.875rem',
                color: 'var(--text-color, var(--color-text-primary))',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              修改密码
            </button>

            <button
              onClick={() => {
                setShowDropdown(false);
                onLogout();
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.625rem 1rem',
                fontSize: '0.875rem',
                color: 'var(--color-danger)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-danger-subtle)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              退出登录
            </button>
          </div>
        </div>
      )}

      {/* 修改密码弹窗 */}
      <Modal
        open={showPasswordModal}
        onClose={() => !passwordSubmitting && setShowPasswordModal(false)}
        title="修改账户密码"
        width="sm"
      >
        <form onSubmit={handlePasswordSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
            {passwordError && (
              <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--color-danger-subtle)', color: 'var(--color-danger)', fontSize: '0.875rem' }}>
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--color-success-subtle)', color: 'var(--color-success)', fontSize: '0.875rem' }}>
                {passwordSuccess}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem', color: 'var(--text-color, var(--color-text-primary))' }}>
                当前密码
              </label>
              <input
                type="password"
                required
                value={passwordForm.oldPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color, var(--color-border-primary))', background: 'var(--card-bg, var(--color-bg-app))', color: 'var(--text-color, var(--color-text-primary))' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem', color: 'var(--text-color, var(--color-text-primary))' }}>
                新密码
              </label>
              <input
                type="password"
                required
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="不少于6位"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color, var(--color-border-primary))', background: 'var(--card-bg, var(--color-bg-app))', color: 'var(--text-color, var(--color-text-primary))' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem', color: 'var(--text-color, var(--color-text-primary))' }}>
                确认新密码
              </label>
              <input
                type="password"
                required
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color, var(--color-border-primary))', background: 'var(--card-bg, var(--color-bg-app))', color: 'var(--text-color, var(--color-text-primary))' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                disabled={passwordSubmitting}
                style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-color, var(--color-border-primary))', background: 'transparent', cursor: 'pointer', color: 'var(--text-color, var(--color-text-primary))' }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={passwordSubmitting}
                style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm, 6px)', border: 'none', background: 'var(--primary-color, var(--color-primary))', color: 'var(--color-text-white, #ffffff)', cursor: 'pointer', fontWeight: 500 }}
              >
                {passwordSubmitting ? '正在提交…' : '确认修改'}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default UserMenu;
