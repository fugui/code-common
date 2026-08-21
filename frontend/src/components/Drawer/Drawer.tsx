import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { zIndexManager, escManager, lockBodyScroll, unlockBodyScroll, ZIndexLevels } from '../../utils/overlay';

export type DrawerWidthPreset = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface DrawerProps {
  /** 控制抽屉是否可见 (标准属性) */
  open?: boolean;
  /** @deprecated 请统一迁移至 open 属性 */
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
  /** 是否展示遮罩层，默认 true */
  mask?: boolean;
  /** 点击遮罩是否允许关闭，默认 true */
  maskClosable?: boolean;
  /** 自定义遮罩层样式 */
  maskStyle?: React.CSSProperties;
  /** 自定义遮罩层类名 */
  maskClassName?: string;
  /** 是否支持键盘 ESC 键快捷关闭，默认 true */
  keyboard?: boolean;
  /** 是否展示顶部科技感渐变条，默认 true */
  headerDecorator?: boolean;
  /** 挂载容器，默认 () => document.body (支持微前端 ShadowDOM / 自定义挂载节点) */
  getContainer?: () => HTMLElement;
  /** 动画状态变更回调 */
  afterOpenChange?: (open: boolean) => void;
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
  mask = true,
  maskClosable = true,
  maskStyle,
  maskClassName = '',
  keyboard = true,
  headerDecorator = true,
  getContainer,
  afterOpenChange,
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
  const [zLevels, setZLevels] = useState<ZIndexLevels | null>(null);
  const zAcquiredRef = useRef(false);
  const closeTimerRef = useRef<number>();

  // 解析宽度
  const resolvedWidth = useMemo(() => {
    if (typeof width === 'number') return `${width}px`;
    if (typeof width === 'string' && width in WIDTH_PRESETS) {
      return WIDTH_PRESETS[width as DrawerWidthPreset];
    }
    return width;
  }, [width]);

  // 关闭流程动画处理（防重入与Timer管理）
  const handleClose = useCallback(() => {
    if (closeTimerRef.current) return;
    setAnimateVisible(false);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = undefined;
      onClose();
      if (afterOpenChange) afterOpenChange(false);
    }, 280);
  }, [onClose, afterOpenChange]);

  // 处理动画与挂载生命周期
  useEffect(() => {
    if (isTargetOpen) {
      if (!zAcquiredRef.current) {
        setZLevels(zIndexManager.acquire());
        zAcquiredRef.current = true;
      }
      setMounted(true);
      const timer = window.setTimeout(() => {
        setAnimateVisible(true);
        if (afterOpenChange) afterOpenChange(true);
      }, 16);
      return () => window.clearTimeout(timer);
    } else {
      setAnimateVisible(false);
      const timer = window.setTimeout(() => {
        setMounted(false);
        if (zAcquiredRef.current) {
          zIndexManager.release();
          zAcquiredRef.current = false;
          setZLevels(null);
        }
      }, 300);
      return () => window.clearTimeout(timer);
    }
  }, [isTargetOpen, afterOpenChange]);

  // 组件卸载时释放 Z-Index 栈并清理定时器
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = undefined;
      }
      if (zAcquiredRef.current) {
        zIndexManager.release();
        zAcquiredRef.current = false;
      }
    };
  }, []);

  // 全局 LIFO ESC 监听栈管理
  useEffect(() => {
    if (!mounted || !animateVisible || !keyboard) return;
    escManager.push(handleClose);
    return () => {
      escManager.pop(handleClose);
    };
  }, [mounted, animateVisible, keyboard, handleClose]);

  // 锁定宿主 body 滚动（包含 Scrollbar 宽度补偿）
  useEffect(() => {
    if (!mounted || !mask) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [mounted, mask]);

  if (!mounted && destroyOnClose) return null;
  if (!mounted && !isTargetOpen) return null;

  const actualExtra = extra || extraHeader;
  const isLeft = placement === 'left';
  const containerTarget = (getContainer ? getContainer() : null) || (typeof document !== 'undefined' ? document.body : null);

  if (!containerTarget) return null;

  const containerZIndex = zLevels ? zLevels.container : 99900;
  const maskZIndex = zLevels ? zLevels.mask : 99901;
  const panelZIndex = zLevels ? zLevels.panel : 99905;

  return createPortal(
    <div
      className={`drawer-root-wrapper ${className}`.trim()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: containerZIndex,
        pointerEvents: (!mask && animateVisible) ? 'none' : (animateVisible ? 'auto' : 'none'),
        display: 'flex',
      }}
    >
      {/* 1. Backdrop 遮罩层 (与 Design Tokens 联动) */}
      {mask && (
        <div
          className={maskClassName}
          onClick={maskClosable ? handleClose : undefined}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--color-bg-overlay, rgba(15, 23, 42, 0.65))',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: maskZIndex,
            opacity: animateVisible ? 1 : 0,
            transition: 'opacity 280ms cubic-bezier(0.16, 1, 0.3, 1)',
            cursor: maskClosable ? 'pointer' : 'default',
            ...maskStyle,
          }}
          title={maskClosable ? '点击遮罩区域关闭' : undefined}
        />
      )}

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
          pointerEvents: animateVisible ? 'auto' : 'none',
          background: 'var(--card-bg, var(--bg-secondary, #111827))',
          color: 'var(--text-color, var(--text-main, #f3f4f6))',
          borderLeft: isLeft ? 'none' : '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRight: isLeft ? '1px solid var(--border-color, rgba(255, 255, 255, 0.08))' : 'none',
          boxShadow: isLeft
            ? '12px 0 36px rgba(0, 0, 0, 0.35)'
            : '-12px 0 36px rgba(0, 0, 0, 0.35)',
          zIndex: panelZIndex,
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
        {headerDecorator && (
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
        )}

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
    containerTarget
  );
};
