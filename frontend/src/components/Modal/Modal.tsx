import React, { useEffect, useState, useCallback, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { zIndexManager, escManager, lockBodyScroll, unlockBodyScroll, ZIndexLevels } from '../../utils/overlay';
import './modal.css';

export type ModalWidthPreset = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalProps {
  /** 控制弹窗打开状态 (标准属性) */
  open?: boolean;
  /** @deprecated 请统一迁移至 open 属性 */
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
  /** 是否展示遮罩层，默认为 true */
  mask?: boolean;
  /** 点击遮罩层是否允许关闭，默认为 true */
  maskClosable?: boolean;
  /** 自定义遮罩层样式 */
  maskStyle?: React.CSSProperties;
  /** 自定义遮罩层类名 */
  maskClassName?: string;
  /** 是否支持键盘 ESC 关闭，默认 true */
  keyboard?: boolean;
  /** 挂载容器，默认 () => document.body (支持微前端 / 自定义容器) */
  getContainer?: () => HTMLElement;
  /** 动画状态变更回调 */
  afterOpenChange?: (open: boolean) => void;
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
  mask = true,
  maskClosable = true,
  maskStyle,
  maskClassName = '',
  keyboard = true,
  getContainer,
  afterOpenChange,
  destroyOnClose = false,
  showCloseButton = true,
  bodyStyle,
  headerStyle,
  footerStyle,
  className = '',
  children,
}) => {
  const isTargetOpen = open !== undefined ? open : (visible ?? false);
  const uniqueTitleId = useId();
  const [mounted, setMounted] = useState(isTargetOpen);
  const [animateVisible, setAnimateVisible] = useState(false);
  const [zLevels, setZLevels] = useState<ZIndexLevels | null>(null);
  const zAcquiredRef = useRef(false);
  const closeTimerRef = useRef<number>();

  const resolvedWidth = typeof width === 'number'
    ? `${width}px`
    : (WIDTH_MAP[width as ModalWidthPreset] || width);

  const resolvedHeight = typeof height === 'number'
    ? `${height}px`
    : height;

  const resolvedMinHeight = typeof minHeight === 'number'
    ? `${minHeight}px`
    : minHeight;

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
      }, 15);
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
      }, 280);
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

  // 锁定宿主 body 滚动（带 Scrollbar 跳动补偿）
  useEffect(() => {
    if (!mounted || !mask) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [mounted, mask]);

  if (!mounted && destroyOnClose) return null;
  if (!mounted && !isTargetOpen) return null;

  const containerTarget = (getContainer ? getContainer() : null) || (typeof document !== 'undefined' ? document.body : null);
  if (!containerTarget) return null;

  const containerZIndex = zLevels ? zLevels.container : 99900;
  const maskZIndex = zLevels ? zLevels.mask : 99901;
  const panelZIndex = zLevels ? zLevels.panel : 99905;

  const pointerClass = (!mask && animateVisible)
    ? 'code-modal-root--pointer-none'
    : (animateVisible ? 'code-modal-root--pointer-auto' : 'code-modal-root--pointer-none');

  const alignClass = centered ? 'code-modal-root--centered' : 'code-modal-root--top';
  const hasStringTitle = typeof title === 'string';

  return createPortal(
    <div
      className={`code-modal-root modal-root-wrapper ${alignClass} ${pointerClass} ${className}`.trim()}
      style={{ zIndex: containerZIndex }}
    >
      {/* 1. Backdrop 遮罩层 */}
      {mask && (
        <div
          className={`code-modal-mask ${animateVisible ? 'code-modal-mask--visible' : ''} ${!maskClosable ? 'code-modal-mask--unclosable' : ''} ${maskClassName}`.trim()}
          onClick={maskClosable ? handleClose : undefined}
          style={{ zIndex: maskZIndex, ...maskStyle }}
          title={maskClosable ? '点击背景区域关闭' : undefined}
        />
      )}

      {/* 2. Modal 对话框面板 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasStringTitle ? uniqueTitleId : undefined}
        className={`code-modal-panel ${animateVisible ? 'code-modal-panel--visible' : 'code-modal-panel--hidden'}`}
        style={{
          width: resolvedWidth,
          height: resolvedHeight,
          minHeight: resolvedMinHeight,
          zIndex: panelZIndex,
          ...style,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部高光装饰条 */}
        <div className="code-modal-decorator" />

        {/* 头部 Header */}
        {(title || subtitle || extra || showCloseButton) && (
          <div className="code-modal-header" style={headerStyle}>
            <div className="code-modal-header-content">
              {hasStringTitle ? (
                <h3 id={uniqueTitleId} className="code-modal-title">
                  {title}
                </h3>
              ) : (
                title
              )}
              {subtitle && <div className="code-modal-subtitle">{subtitle}</div>}
            </div>

            <div className="code-modal-actions">
              {extra}
              {showCloseButton && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="code-modal-close-btn"
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
        <div className="code-modal-body" style={bodyStyle}>
          {children}
        </div>

        {/* 底部 Footer */}
        {footer && (
          <div className="code-modal-footer" style={footerStyle}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    containerTarget
  );
};
