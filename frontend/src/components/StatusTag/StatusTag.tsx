import React from 'react';
import './status-tag.css';

export type StatusType = 'success' | 'running' | 'failed' | 'error' | 'warning' | 'pending' | 'queued' | 'neutral';
export type StatusTagShape = 'pill' | 'rounded';
export type StatusTagSize = 'sm' | 'md';
export type StatusTagVariant = 'subtle' | 'solid' | 'outline';

export interface StatusTagProps {
  /** 业务或执行状态 */
  status: StatusType;
  /** 显示文案，缺省时自动根据状态生成默认中文标签 */
  text?: React.ReactNode;
  /** 是否显示前置状态圆点（running 状态自动带呼吸动画），默认为 true */
  dot?: boolean;
  /** 形状：pill 胶囊圆角，rounded 细圆角，默认为 'pill' */
  shape?: StatusTagShape;
  /** 尺寸大小，默认为 'md' */
  size?: StatusTagSize;
  /** 渲染风格，默认为 'subtle' */
  variant?: StatusTagVariant;
  /** 自定义外层样式 */
  style?: React.CSSProperties;
  /** 自定义类名 */
  className?: string;
}

const DEFAULT_LABELS: Record<StatusType, string> = {
  success: '成功 / 正常',
  running: '进行中 / 运行',
  failed: '失败 / 异常',
  error: '错误 / 严重',
  warning: '警告 / 注意',
  pending: '排队中 / 等待',
  queued: '已入队',
  neutral: '未开始 / 默认',
};

export const StatusTag: React.FC<StatusTagProps> = ({
  status,
  text,
  dot = true,
  shape = 'pill',
  size = 'md',
  variant = 'subtle',
  style,
  className = '',
}) => {
  const displayText = text || DEFAULT_LABELS[status] || DEFAULT_LABELS.neutral;
  const isSm = size === 'sm';
  const hasPulse = status === 'running';

  const statusClass = `code-status-tag--${status}`;
  const sizeClass = `code-status-tag--${size}`;
  const shapeClass = `code-status-tag--${shape}`;
  const variantClass = `code-status-tag--${variant}`;

  return (
    <span
      className={`code-status-tag status-tag-badge ${statusClass} ${sizeClass} ${shapeClass} ${variantClass} ${className}`.trim()}
      style={style}
    >
      {dot && (
        <span className={`code-status-tag-dot-wrapper ${isSm ? 'code-status-tag-dot-wrapper--sm' : 'code-status-tag-dot-wrapper--md'}`}>
          {hasPulse && <span className="code-status-tag-pulse" />}
          <span className={`code-status-tag-dot ${isSm ? 'code-status-tag-dot--sm' : 'code-status-tag-dot--md'}`} />
        </span>
      )}
      <span>{displayText}</span>
    </span>
  );
};
