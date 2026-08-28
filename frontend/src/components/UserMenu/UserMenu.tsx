import React, { useState, useEffect, useRef } from 'react';
import type { User } from '../../types/user';
import { ROLE_REGISTRY } from '../../utils/roleMeta';
import { Modal } from '../Modal';
import './user-menu.css';

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
    <div ref={menuRef} className="code-user-menu-wrapper">
      <button
        type="button"
        onClick={() => setShowDropdown(!showDropdown)}
        className="code-user-menu-trigger"
        aria-expanded={showDropdown}
        aria-haspopup="true"
      >
        <div className="code-user-menu-avatar">
          {initialChar}
        </div>
        <div className="code-user-menu-info">
          <span className="code-user-menu-name">
            {displayName}
          </span>
          {isSuperAdmin ? (
            <span className="code-user-menu-superadmin">超级管理员</span>
          ) : (
            (() => {
              const matchedRoles = roles
                .map((r) => ROLE_REGISTRY[r])
                .filter(Boolean);
              if (matchedRoles.length > 0) {
                return (
                  <div className="code-user-menu-roles-row">
                    {matchedRoles.map((item, idx) => (
                      <span
                        key={idx}
                        className="code-user-menu-role-tag"
                        style={{
                          background: item.badgeBg,
                          color: item.badgeColor,
                        }}
                      >
                        {item.shortName}
                      </span>
                    ))}
                    <span className="code-user-menu-admin-suffix">管理员</span>
                  </div>
                );
              }
              return (
                <span className="code-user-menu-dept">
                  {deptName || '普通成员'}
                </span>
              );
            })()
          )}
        </div>
      </button>

      {showDropdown && (
        <div className="code-user-menu-dropdown">
          <div className="code-user-menu-dropdown-header">
            <div className="code-user-menu-dropdown-name">{displayName}</div>
            <div className="code-user-menu-dropdown-email">
              {user.email || user.employee_id || ''}
            </div>
          </div>

          <div className="code-user-menu-dropdown-items">
            {extraDropdownItems}

            <button
              type="button"
              onClick={() => {
                setShowDropdown(false);
                setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
                setPasswordError('');
                setPasswordSuccess('');
                setShowPasswordModal(true);
              }}
              className="code-user-menu-item"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              修改密码
            </button>

            <button
              type="button"
              onClick={() => {
                setShowDropdown(false);
                onLogout();
              }}
              className="code-user-menu-item code-user-menu-item--danger"
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
          <div className="code-user-menu-form">
            {passwordError && (
              <div className="code-user-menu-form-alert code-user-menu-form-alert--error">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="code-user-menu-form-alert code-user-menu-form-alert--success">
                {passwordSuccess}
              </div>
            )}

            <div className="code-user-menu-form-group">
              <label className="code-user-menu-form-label">
                当前密码
              </label>
              <input
                type="password"
                required
                value={passwordForm.oldPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                className="code-user-menu-form-input"
              />
            </div>

            <div className="code-user-menu-form-group">
              <label className="code-user-menu-form-label">
                新密码
              </label>
              <input
                type="password"
                required
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="不少于6位"
                className="code-user-menu-form-input"
              />
            </div>

            <div className="code-user-menu-form-group">
              <label className="code-user-menu-form-label">
                确认新密码
              </label>
              <input
                type="password"
                required
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="code-user-menu-form-input"
              />
            </div>

            <div className="code-user-menu-form-actions">
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                disabled={passwordSubmitting}
                className="code-user-menu-btn-cancel"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={passwordSubmitting}
                className="code-user-menu-btn-submit"
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
