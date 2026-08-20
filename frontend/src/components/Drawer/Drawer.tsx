import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

export type DrawerWidthPreset = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface DrawerProps {
  /** 控制抽屉是否可见 (支持 open 或 visible) */
  open?: boolean;
  visible?: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 抽屉标题 */
  title?: React.ReactNode;
  /** 抽屉副标题/辅助说明 */
  subtitle?: React.ReactNode;
  /** 标题栏右侧额外操作区 (关闭按钮左侧) */
  extra?: React.ReactNode;
  extraHeader?: React.ReactNode;
  /** 抽屉底部固定操作区 */
  footer?: React.ReactNode;
  /** 抽屉宽度，支持预设 ('sm'|'md'|'lg'|'xl'|'full') 或自定义数值/CSS字符串 */
  width?: DrawerWidthPreset | number | string;
  /** 抽屉滑出方向，默认 'right' */
  placement?: 'right' | 'left';
  /** 点击遮罩是否允许关闭，默认 true */
  maskClosable?: boolean;
  /** 是否在关闭后销毁子内容，默认 false */
  destroyOnClose?: boolean;
  /** 是否展示右上角关闭按钮，默认 true */
  showCloseButton?: boolean;
  /** 自定义外层类名 */
  className?: string;
  /** 头部自定义样式 */
  headerStyle?: React.CSSProperties;
  /** 内容主体自定义样式 */
  bodyStyle?: React.CSSProperties;
  /** 底部自定义样式 */
  footerStyle?: React.CSSProperties;
  /** 子元素 */
  children?: React.ReactNode;
}

const WIDTH_PRESETS: Record<DrawerWidthPreset, string> = {
  sm: '420px',
  md: '640px',
  lg: '840px',
  xl: '1080px',
  full: '100vw',
};

export const Drawer: React.FC<DrawerProps> = ({
  open,
  visible,
  onClose,
  title,
  subtitle,
  extra,
  extraHeader,
  footer,
  width = 'min(840px, 92vw)',
  placement = 'right',
  maskClosable = true,
  destroyOnClose = false,
  showCloseButton = true,
  className = '',
  headerStyle,
  bodyStyle,
  footerStyle,
  children,
}) => {
  const isTargetOpen = open !== undefined ? open : (visible ?? false);
  const [mounted, setMounted] = useState(isTargetOpen);
  const [animateVisible, setAnimateVisible] = useState(false);

  // 解析宽度
  const resolvedWidth = useMemo(() => {
    if (typeof width === 'number') return `${width}px`;
    if (typeof width === 'string' && width in WIDTH_PRESETS) {
      return WIDTH_PRESETS[width as DrawerWidthPreset];
    }
    return width;
  }, [width]);

  // 处理动画与挂载状态
  useEffect(() => {
    if (isTargetOpen) {
      setMounted(true);
      const timer = window.setTimeout(() => {
        setAnimateVisible(true);
      }, 16);
      return () => window.clearTimeout(timer);
    } else {
      setAnimateVisible(false);
      const timer = window.setTimeout(() => {
        setMounted(false);
      }, 300);
      return () => window.clearTimeout(timer);
    }
  }, [isTargetOpen]);

  // 关闭流程动画处理
  const handleClose = useCallback(() => {
    setAnimateVisible(false);
    window.setTimeout(() => {
      onClose();
    }, 280);
  }, [onClose]);

  // 键盘 ESC 监听
  useEffect(() => {
    if (!mounted || !animateVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mounted, animateVisible, handleClose]);

  // 锁定宿主 body 滚动
  useEffect(() => {
    if (!mounted) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mounted]);

  if (!mounted && destroyOnClose) return null;
  if (!mounted && !isTargetOpen) return null;

  const actualExtra = extra || extraHeader;
  const isLeft = placement === 'left';

  return createPortal(
    <div
      className={`drawer-root-wrapper ${className}`.trim()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99990,
        pointerEvents: animateVisible ? 'auto' : 'none',
        display: 'flex',
      }}
    >
      {/* 1. Backdrop 遮罩层 */}
      <div
        onClick={maskClosable ? handleClose : undefined}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 99991,
          opacity: animateVisible ? 1 : 0,
          transition: 'opacity 280ms cubic-bezier(0.16, 1, 0.3, 1)',
          cursor: maskClosable ? 'pointer' : 'default',
        }}
        title={maskClosable ? '点击遮罩区域关闭' : undefined}
      />

      {/* 2. Drawer Panel 滑出面板 */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          [isLeft ? 'left' : 'right']: 0,
          width: resolvedWidth,
          maxWidth: '100vw',
          height: '100vh',
          background: 'var(--card-bg, var(--bg-secondary, #111827))',
          color: 'var(--text-color, var(--text-main, #f3f4f6))',
          borderLeft: isLeft ? 'none' : '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRight: isLeft ? '1px solid var(--border-color, rgba(255, 255, 255, 0.08))' : 'none',
          boxShadow: isLeft
            ? '12px 0 36px rgba(0, 0, 0, 0.35)'
            : '-12px 0 36px rgba(0, 0, 0, 0.35)',
          zIndex: 99995,
          transform: animateVisible
            ? 'translateX(0)'
            : `translateX(${isLeft ? '-100%' : '100%'})`,
          transition: 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部渐变装饰条 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'linear-gradient(90deg, var(--color-primary), var(--color-info), var(--color-primary))',
            backgroundSize: '200% 100%',
            zIndex: 10,
          }}
        />

        {/* 头部 Header */}
        {(title || subtitle || actualExtra || showCloseButton) && (
          <div
            style={{
              padding: '20px 24px 16px 24px',
              borderBottom: '1px solid var(--border-color, var(--color-border-subtle))',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              background: 'var(--bg-color, var(--color-bg-app))',
              flexShrink: 0,
              gap: 16,
              ...headerStyle,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
              {typeof title === 'string' ? (
                <h3
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    margin: 0,
                    color: 'var(--text-color, var(--color-text-primary))',
                    letterSpacing: '-0.3px',
                    wordBreak: 'break-word',
                  }}
                >
                  {title}
                </h3>
              ) : (
                title
              )}
              {subtitle && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, var(--color-text-secondary))', marginTop: 2 }}>
                  {subtitle}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {actualExtra}
              {showCloseButton && (
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    padding: '6px',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid transparent',
                    background: 'var(--color-bg-hover)',
                    color: 'var(--text-secondary, var(--color-text-secondary))',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = 'var(--color-danger)';
                    e.currentTarget.style.background = 'var(--color-danger-subtle)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--text-secondary, var(--color-text-secondary))';
                    e.currentTarget.style.background = 'var(--color-bg-hover)';
                  }}
                  title="关闭 (Esc)"
                  aria-label="关闭抽屉"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 主体滚动区 Body */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            padding: '24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            ...bodyStyle,
          }}
        >
          {children}
        </div>

        {/* 底部 Footer */}
        {footer && (
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border-color, var(--color-border-subtle))',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '12px',
              background: 'var(--bg-color, var(--color-bg-app))',
              flexShrink: 0,
              ...footerStyle,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
