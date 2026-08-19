import React from 'react';
import { useVersionCheck, UseVersionCheckOptions } from '../../hooks/useVersionCheck';

export interface VersionNotificationProps extends UseVersionCheckOptions {
  customMessage?: string;
}

export const VersionNotification: React.FC<VersionNotificationProps> = (props) => {
  const { hasNewVersion, latestVersion, dismiss, reload } = useVersionCheck(props);

  if (!hasNewVersion) return null;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: '18px', lineHeight: 1 }}>🚀</span>
        <strong style={{ fontSize: '14px', color: 'var(--color-text, #1f2937)', fontWeight: 600 }}>
          系统版本已更新
        </strong>
      </div>
      <div style={bodyStyle}>
        {props.customMessage ||
          `检测到新版本发布（构建时间: ${latestVersion?.buildTime || '刚刚'}），建议刷新页面获取最新体验。`}
      </div>
      <div style={actionRowStyle}>
        <button type="button" onClick={dismiss} style={dismissBtnStyle}>
          稍后提醒
        </button>
        <button type="button" onClick={reload} style={reloadBtnStyle}>
          立即刷新
        </button>
      </div>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '24px',
  right: '24px',
  zIndex: 99999,
  width: '320px',
  backgroundColor: 'var(--color-bg-container, #ffffff)',
  borderRadius: '8px',
  border: '1px solid var(--color-border, #e5e7eb)',
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  fontFamily: 'inherit',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const bodyStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--color-text-secondary, #4b5563)',
  lineHeight: 1.5,
};

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  marginTop: '4px',
};

const dismissBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  border: '1px solid var(--color-border, #d1d5db)',
  backgroundColor: 'transparent',
  fontSize: '12px',
  color: 'var(--color-text, #374151)',
  cursor: 'pointer',
  transition: 'background-color 0.2s',
};

const reloadBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: '6px',
  border: 'none',
  backgroundColor: 'var(--color-primary, #1677ff)',
  fontSize: '12px',
  color: '#ffffff',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'opacity 0.2s',
};
