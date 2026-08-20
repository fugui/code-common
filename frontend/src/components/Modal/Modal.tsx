import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

export type ModalWidthPreset = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalProps {
  /** 控制弹窗打开状态 */
  open?: boolean;
  /** 兼容 visible 属性 */
  visible?: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 弹窗标题 */
  title?: React.ReactNode;
  /** 弹窗副标题 */
  subtitle?: React.ReactNode;
  /** 头部右侧额外操作区 */
  extra?: React.ReactNode;
  /** 底部操作栏 */
  footer?: React.ReactNode;
  /** 弹窗宽度预设或自定义数值 (sm: 440px, md: 580px, lg: 760px, xl: 960px, full: 94vw) */
  width?: ModalWidthPreset | string | number;
  /** 弹窗高度数值或 CSS 字符串 (如 '75vh', '600px', 500) */
  height?: string | number;
  /** 弹窗最小高度数值或 CSS 字符串 */
  minHeight?: string | number;
  /** 弹窗面板自定义样式 */
  style?: React.CSSProperties;
  /** 是否垂直水平居中展示，默认为 true */
  centered?: boolean;
  /** 点击遮罩层是否允许关闭，默认为 true */
  maskClosable?: boolean;
  /** 关闭时是否销毁子元素，默认为 false */
  destroyOnClose?: boolean;
  /** 是否显示右上角关闭按钮，默认为 true */
  showCloseButton?: boolean;
  /** 自定义主体区域样式 */
  bodyStyle?: React.CSSProperties;
  /** 自定义头部样式 */
  headerStyle?: React.CSSProperties;
  /** 自定义底部样式 */
  footerStyle?: React.CSSProperties;
  /** 最外层自定义类名 */
  className?: string;
  /** 子元素内容 */
  children?: React.ReactNode;
}

const WIDTH_MAP: Record<ModalWidthPreset, string> = {
  sm: '440px',
  md: '580px',
  lg: '760px',
  xl: '960px',
  full: 'min(1200px, 94vw)',
};

export const Modal: React.FC<ModalProps> = ({
  open,
  visible,
  onClose,
  title,
  subtitle,
  extra,
  footer,
  width = 'md',
  height,
  minHeight,
  style,
  centered = true,
  maskClosable = true,
  destroyOnClose = false,
  showCloseButton = true,
  bodyStyle,
  headerStyle,
  footerStyle,
  className = '',
  children,
}) => {
  const isTargetOpen = open !== undefined ? open : (visible ?? false);
  const [mounted, setMounted] = useState(isTargetOpen);
  const [animateVisible, setAnimateVisible] = useState(false);

  const resolvedWidth = typeof width === 'number'
    ? `${width}px`
    : (WIDTH_MAP[width as ModalWidthPreset] || width);

  const resolvedHeight = typeof height === 'number'
    ? `${height}px`
    : height;

  const resolvedMinHeight = typeof minHeight === 'number'
    ? `${minHeight}px`
    : minHeight;

  const handleClose = useCallback(() => {
    setAnimateVisible(false);
    const timer = setTimeout(() => {
      onClose();
    }, 280);
    return () => clearTimeout(timer);
  }, [onClose]);

  useEffect(() => {
    if (isTargetOpen) {
      setMounted(true);
      const timer = setTimeout(() => setAnimateVisible(true), 15);
      return () => clearTimeout(timer);
    } else {
      setAnimateVisible(false);
      const timer = setTimeout(() => setMounted(false), 280);
      return () => clearTimeout(timer);
    }
  }, [isTargetOpen]);

  // 监听 ESC 键
  useEffect(() => {
    if (!mounted || !animateVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
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

  return createPortal(
    <div
      className={`modal-root-wrapper ${className}`.trim()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99990,
        pointerEvents: animateVisible ? 'auto' : 'none',
        display: 'flex',
        alignItems: centered ? 'center' : 'flex-start',
        justifyContent: 'center',
        padding: centered ? '24px' : '64px 24px 24px 24px',
        overflowY: 'auto',
      }}
    >
      {/* 1. Backdrop 遮罩层 */}
      <div
        onClick={maskClosable ? handleClose : undefined}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)',
          zIndex: 99991,
          opacity: animateVisible ? 1 : 0,
          transition: 'opacity 260ms cubic-bezier(0.16, 1, 0.3, 1)',
          cursor: maskClosable ? 'pointer' : 'default',
        }}
        title={maskClosable ? '点击背景区域关闭' : undefined}
      />

      {/* 2. Modal 对话框面板 */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'relative',
          width: resolvedWidth,
          maxWidth: '100%',
          maxHeight: 'calc(100vh - 80px)',
          height: resolvedHeight,
          minHeight: resolvedMinHeight,
          background: 'var(--card-bg, var(--bg-secondary, #111827))',
          color: 'var(--text-color, var(--text-main, #f3f4f6))',
          borderRadius: '14px',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          zIndex: 99995,
          opacity: animateVisible ? 1 : 0,
          transform: animateVisible ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(12px)',
          transition: 'transform 280ms cubic-bezier(0.16, 1, 0.3, 1), opacity 260ms cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          ...style,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部高光装饰条 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)',
            zIndex: 10,
          }}
        />

        {/* 头部 Header */}
        {(title || subtitle || extra || showCloseButton) && (
          <div
            style={{
              padding: '20px 24px 16px 24px',
              borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              background: 'var(--bg-color, var(--bg-primary, #090d16))',
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
                    color: 'var(--text-color, var(--text-main, #f3f4f6))',
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
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)', marginTop: 2 }}>
                  {subtitle}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {extra}
              {showCloseButton && (
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    padding: '6px',
                    borderRadius: '8px',
                    border: '1px solid transparent',
                    background: 'var(--bg-secondary, rgba(255, 255, 255, 0.06))',
                    color: 'var(--text-secondary, #94a3b8)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#ef4444';
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)';
                    e.currentTarget.style.background = 'var(--bg-secondary, rgba(255, 255, 255, 0.06))';
                  }}
                  title="关闭 (Esc)"
                  aria-label="关闭弹窗"
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

        {/* 内容主体 Body */}
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
              borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '12px',
              background: 'var(--bg-color, var(--bg-primary, #090d16))',
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
