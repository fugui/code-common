import React from 'react';
import { useVersionCheck, UseVersionCheckOptions } from '../../hooks/useVersionCheck';
import './version-notification.css';

export interface VersionNotificationProps extends UseVersionCheckOptions {
  customMessage?: string;
}

export const VersionNotification: React.FC<VersionNotificationProps> = (props) => {
  const { hasNewVersion, latestVersion, dismiss, reload } = useVersionCheck(props);

  if (!hasNewVersion) return null;

  return (
    <div className="code-version-notification">
      <div className="code-version-notification-header">
        <span className="code-version-notification-icon">🚀</span>
        <strong className="code-version-notification-title">
          系统版本已更新
        </strong>
      </div>
      <div className="code-version-notification-body">
        {props.customMessage ||
          `检测到新版本发布（构建时间: ${latestVersion?.buildTime || '刚刚'}），建议刷新页面获取最新体验。`}
      </div>
      <div className="code-version-notification-actions">
        <button type="button" onClick={dismiss} className="code-version-notification-btn-dismiss">
          稍后提醒
        </button>
        <button type="button" onClick={reload} className="code-version-notification-btn-reload">
          立即刷新
        </button>
      </div>
    </div>
  );
};
