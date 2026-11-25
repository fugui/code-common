import React from 'react';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import './copy-button.css';

export type CopyButtonVariant = 'secondary' | 'primary' | 'ghost' | 'unstyled';
export type CopyButtonSize = 'xs' | 'sm' | 'md';

export interface CopyButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    'children' | 'onCopy' | 'onError'
  > {
  /** 待复制的文本内容或惰性求值函数 */
  text: string | (() => string);
  /** 默认文案，默认 '复制' */
  label?: React.ReactNode;
  /** 复制成功后的文案，默认 '已复制' */
  copiedLabel?: React.ReactNode;
  /** 复制失败后的文案，默认 '复制失败' */
  errorLabel?: React.ReactNode;
  /** 是否仅显示图标，默认 false */
  iconOnly?: boolean;
  /** 是否显示图标，默认 true */
  showIcon?: boolean;
  /** 图标尺寸（px），默认 14 */
  iconSize?: number;
  /** 自定义默认图标 */
  icon?: React.ReactNode;
  /** 自定义复制成功图标 */
  copiedIcon?: React.ReactNode;
  /** 自定义复制失败图标 */
  errorIcon?: React.ReactNode;
  /** 按钮外观变体，默认 'secondary' */
  variant?: CopyButtonVariant;
  /** 按钮尺寸，默认 'sm' */
  size?: CopyButtonSize;
  /** 状态自动复位延时（ms），默认 1800 */
  resetDelay?: number;
  /** 点击时是否阻止事件冒泡，默认 false */
  stopPropagation?: boolean;
  /** 复制成功回调 */
  onCopied?: (text: string) => void;
  /** 复制失败回调 */
  onCopyError?: (error?: unknown) => void;
}

interface SvgIconProps {
  size: number;
}

const iconSvgProps = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
});

const CopySvgIcon: React.FC<SvgIconProps> = ({ size }) => (
  <svg {...iconSvgProps(size)}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const CheckSvgIcon: React.FC<SvgIconProps> = ({ size }) => (
  <svg {...iconSvgProps(size)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const AlertCircleSvgIcon: React.FC<SvgIconProps> = ({ size }) => (
  <svg {...iconSvgProps(size)}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" x2="12" y1="8" y2="12" />
    <line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
);

/**
 * 通用复制按钮组件，兼容 HTTPS Clipboard API 与内网 HTTP execCommand 降级复制。
 */
export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label = '复制',
  copiedLabel = '已复制',
  errorLabel = '复制失败',
  iconOnly = false,
  showIcon = true,
  iconSize = 14,
  icon,
  copiedIcon,
  errorIcon,
  variant = 'secondary',
  size = 'sm',
  resetDelay = 1800,
  stopPropagation = false,
  onCopied,
  onCopyError,
  onClick,
  type = 'button',
  className = '',
  title,
  'aria-label': ariaLabel,
  ...rest
}) => {
  const { status, copy } = useCopyToClipboard({
    resetDelay,
    onSuccess: onCopied,
    onError: onCopyError,
  });

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
    onClick?.(e);
    if (e.defaultPrevented) {
      return;
    }
    const content = typeof text === 'function' ? text() : text;
    void copy(content);
  };

  const currentLabel =
    status === 'copied'
      ? copiedLabel
      : status === 'error'
        ? errorLabel
        : label;

  const shouldRenderIcon = iconOnly || showIcon;
  const currentIcon = shouldRenderIcon
    ? status === 'copied'
      ? (copiedIcon ?? <CheckSvgIcon size={iconSize} />)
      : status === 'error'
        ? (errorIcon ?? <AlertCircleSvgIcon size={iconSize} />)
        : (icon ?? <CopySvgIcon size={iconSize} />)
    : null;

  const resolvedAriaLabel =
    ariaLabel ??
    (iconOnly ? (typeof currentLabel === 'string' ? currentLabel : '复制') : undefined);

  const resolvedTitle =
    title ??
    (status === 'error'
      ? '复制失败，请手动复制'
      : iconOnly && typeof currentLabel === 'string'
        ? currentLabel
        : undefined);

  const classes = [
    'code-copy-btn',
    `code-copy-btn--${variant}`,
    variant !== 'unstyled' ? `code-copy-btn--${size}` : '',
    iconOnly && variant !== 'unstyled' ? 'code-copy-btn--icon-only' : '',
    status !== 'idle' ? `code-copy-btn--${status}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      title={resolvedTitle}
      aria-label={resolvedAriaLabel}
      data-copy-status={status}
      onClick={handleClick}
    >
      {currentIcon && <span className="code-copy-btn-icon">{currentIcon}</span>}
      {!iconOnly && <span className="code-copy-btn-label">{currentLabel}</span>}
    </button>
  );
};
