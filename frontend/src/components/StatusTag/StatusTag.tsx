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
    color: 'var(--color-success)',
    bgSubtle: 'var(--color-success-subtle)',
    bgSolid: 'var(--color-success)',
    border: 'var(--color-success-border)',
    dotColor: 'var(--color-success)',
  },
  running: {
    label: '进行中 / 运行',
    color: 'var(--color-primary)',
    bgSubtle: 'var(--color-primary-subtle)',
    bgSolid: 'var(--color-primary)',
    border: 'var(--color-primary-border)',
    dotColor: 'var(--color-primary)',
    hasPulse: true,
  },
  failed: {
    label: '失败 / 异常',
    color: 'var(--color-danger)',
    bgSubtle: 'var(--color-danger-subtle)',
    bgSolid: 'var(--color-danger)',
    border: 'var(--color-danger-border)',
    dotColor: 'var(--color-danger)',
  },
  error: {
    label: '错误 / 严重',
    color: 'var(--color-danger)',
    bgSubtle: 'var(--color-danger-subtle)',
    bgSolid: 'var(--color-danger)',
    border: 'var(--color-danger-border)',
    dotColor: 'var(--color-danger)',
  },
  warning: {
    label: '警告 / 注意',
    color: 'var(--color-warning)',
    bgSubtle: 'var(--color-warning-subtle)',
    bgSolid: 'var(--color-warning)',
    border: 'var(--color-warning-border)',
    dotColor: 'var(--color-warning)',
  },
  pending: {
    label: '排队中 / 等待',
    color: 'var(--color-info)',
    bgSubtle: 'var(--color-info-subtle)',
    bgSolid: 'var(--color-info)',
    border: 'var(--color-info-border)',
    dotColor: 'var(--color-info)',
  },
  queued: {
    label: '已入队',
    color: 'var(--color-info)',
    bgSubtle: 'var(--color-info-subtle)',
    bgSolid: 'var(--color-info)',
    border: 'var(--color-info-border)',
    dotColor: 'var(--color-info)',
  },
  neutral: {
    label: '未开始 / 默认',
    color: 'var(--color-text-secondary)',
    bgSubtle: 'var(--color-bg-muted)',
    bgSolid: 'var(--color-text-muted)',
    border: 'var(--color-border-subtle)',
    dotColor: 'var(--color-text-secondary)',
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
  const displayText = text || theme.label;

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'solid':
        return {
          backgroundColor: theme.bgSolid,
          color: 'var(--color-text-white, #ffffff)',
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

  const colors = getVariantStyles();

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
              backgroundColor: variant === 'solid' ? 'var(--color-text-white, #ffffff)' : theme.dotColor,
            }}
          />
        </span>
      )}
      <span>{displayText}</span>

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
