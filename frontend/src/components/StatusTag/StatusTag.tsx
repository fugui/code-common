import React from 'react';

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

interface StatusTheme {
  label: string;
  color: string;
  bgSubtle: string;
  bgSolid: string;
  border: string;
  dotColor: string;
  hasPulse?: boolean;
}

const THEME_MAP: Record<string, StatusTheme> = {
  success: {
    label: '成功 / 正常',
    color: '#10b981',
    bgSubtle: 'rgba(16, 185, 129, 0.12)',
    bgSolid: '#10b981',
    border: 'rgba(16, 185, 129, 0.25)',
    dotColor: '#10b981',
  },
  running: {
    label: '进行中 / 运行',
    color: '#3b82f6',
    bgSubtle: 'rgba(59, 130, 246, 0.12)',
    bgSolid: '#3b82f6',
    border: 'rgba(59, 130, 246, 0.25)',
    dotColor: '#3b82f6',
    hasPulse: true,
  },
  failed: {
    label: '失败 / 异常',
    color: '#ef4444',
    bgSubtle: 'rgba(239, 68, 68, 0.12)',
    bgSolid: '#ef4444',
    border: 'rgba(239, 68, 68, 0.25)',
    dotColor: '#ef4444',
  },
  error: {
    label: '错误 / 严重',
    color: '#ef4444',
    bgSubtle: 'rgba(239, 68, 68, 0.12)',
    bgSolid: '#ef4444',
    border: 'rgba(239, 68, 68, 0.25)',
    dotColor: '#ef4444',
  },
  warning: {
    label: '警告 / 注意',
    color: '#f59e0b',
    bgSubtle: 'rgba(245, 158, 11, 0.12)',
    bgSolid: '#f59e0b',
    border: 'rgba(245, 158, 11, 0.25)',
    dotColor: '#f59e0b',
  },
  pending: {
    label: '排队中 / 等待',
    color: '#a855f7',
    bgSubtle: 'rgba(168, 85, 247, 0.12)',
    bgSolid: '#a855f7',
    border: 'rgba(168, 85, 247, 0.25)',
    dotColor: '#a855f7',
  },
  queued: {
    label: '已入队',
    color: '#a855f7',
    bgSubtle: 'rgba(168, 85, 247, 0.12)',
    bgSolid: '#a855f7',
    border: 'rgba(168, 85, 247, 0.25)',
    dotColor: '#a855f7',
  },
  neutral: {
    label: '未开始 / 默认',
    color: '#94a3b8',
    bgSubtle: 'rgba(148, 163, 184, 0.12)',
    bgSolid: '#64748b',
    border: 'rgba(148, 163, 184, 0.25)',
    dotColor: '#94a3b8',
  },
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
  const theme = THEME_MAP[status] || THEME_MAP.neutral;
  const isSm = size === 'sm';

  const getColors = () => {
    switch (variant) {
      case 'solid':
        return {
          background: theme.bgSolid,
          color: '#ffffff',
          border: '1px solid transparent',
        };
      case 'outline':
        return {
          background: 'transparent',
          color: theme.color,
          border: `1px solid ${theme.border}`,
        };
      case 'subtle':
      default:
        return {
          background: theme.bgSubtle,
          color: theme.color,
          border: `1px solid ${theme.border}`,
        };
    }
  };

  const colors = getColors();

  return (
    <span
      className={`status-tag-badge ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSm ? '4px' : '6px',
        padding: isSm ? '1px 7px' : '3px 10px',
        borderRadius: shape === 'pill' ? '9999px' : '6px',
        fontSize: isSm ? '0.725rem' : '0.8rem',
        fontWeight: 600,
        lineHeight: 1.25,
        width: 'fit-content',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...colors,
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: isSm ? '6px' : '8px',
            height: isSm ? '6px' : '8px',
          }}
        >
          {theme.hasPulse && (
            <span
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                backgroundColor: theme.dotColor,
                opacity: 0.75,
                animation: 'statusTagPing 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
              }}
            />
          )}
          <span
            style={{
              position: 'relative',
              display: 'inline-block',
              width: isSm ? '5px' : '6px',
              height: isSm ? '5px' : '6px',
              borderRadius: '50%',
              backgroundColor: variant === 'solid' ? '#ffffff' : theme.dotColor,
            }}
          />
        </span>
      )}
      <span>{text !== undefined ? text : theme.label}</span>

      <style>{`
        @keyframes statusTagPing {
          75%, 100% {
            transform: scale(2.2);
            opacity: 0;
          }
        }
      `}</style>
    </span>
  );
};
