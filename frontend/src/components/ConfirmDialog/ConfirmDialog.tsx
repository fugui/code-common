import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { zIndexManager, escManager, lockBodyScroll, unlockBodyScroll, ZIndexLevels } from '../../utils/overlay';

export type ConfirmType = 'danger' | 'warning' | 'info';

export interface ConfirmDialogProps {
  /** 控制弹窗打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 确认回调 (支持异步 Promise) */
  onConfirm?: () => void | Promise<any>;
  /** 弹窗标题 */
  title: string;
  /** 详细提示内容 */
  content: React.ReactNode;
  /** 确认按钮文字，默认 "确认" */
  confirmText?: string;
  /** 取消按钮文字，默认 "取消" */
  cancelText?: string;
  /** 类型：'danger' (危险操作/红色) | 'warning' (警告/橙色) | 'info' (普通确认/蓝色) */
  type?: ConfirmType;
  /** 加载状态 */
  loading?: boolean;
  /** 挂载容器，默认 () => document.body (支持微前端 / 自定义容器) */
  getContainer?: () => HTMLElement;
  /** 自定义根类名 */
  className?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  content,
  confirmText = '确认',
  cancelText = '取消',
  type = 'warning',
  loading = false,
  getContainer,
  className = '',
}) => {
  const [mounted, setMounted] = useState(open);
  const [animateVisible, setAnimateVisible] = useState(false);
  const [internalLoading, setInternalLoading] = useState(false);
  const [zLevels, setZLevels] = useState<ZIndexLevels | null>(null);
  const zAcquiredRef = useRef(false);

  const isLoading = loading || internalLoading;

  // 动画与挂载控制
  useEffect(() => {
    if (open) {
      if (!zAcquiredRef.current) {
        setZLevels(zIndexManager.acquire());
        zAcquiredRef.current = true;
      }
      setMounted(true);
      const timer = setTimeout(() => setAnimateVisible(true), 15);
      return () => clearTimeout(timer);
    } else {
      setAnimateVisible(false);
      const timer = setTimeout(() => {
        setMounted(false);
        if (zAcquiredRef.current) {
          zIndexManager.release();
          zAcquiredRef.current = false;
          setZLevels(null);
        }
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // 组件卸载时释放 Z-Index 栈
  useEffect(() => {
    return () => {
      if (zAcquiredRef.current) {
        zIndexManager.release();
        zAcquiredRef.current = false;
      }
    };
  }, []);

  // 全局 LIFO ESC 键监听
  useEffect(() => {
    if (!mounted || !animateVisible || isLoading) return;
    escManager.push(onClose);
    return () => {
      escManager.pop(onClose);
    };
  }, [mounted, animateVisible, isLoading, onClose]);

  // 滚动锁定（带 Scrollbar 跳动补偿）
  useEffect(() => {
    if (!mounted) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [mounted]);

  if (!mounted && !open) return null;

  const handleConfirmClick = async () => {
    if (isLoading) return;
    if (onConfirm) {
      try {
        const result = onConfirm();
        if (result instanceof Promise) {
          setInternalLoading(true);
          await result;
        }
      } finally {
        setInternalLoading(false);
      }
    }
    onClose();
  };

  // 类型图标与颜色
  const typeConfig = {
    danger: {
      color: 'var(--color-danger)',
      bgColor: 'var(--color-danger-subtle)',
      btnBg: 'var(--color-danger)',
      btnHover: 'var(--color-danger-hover)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    },
    warning: {
      color: 'var(--color-warning)',
      bgColor: 'var(--color-warning-subtle)',
      btnBg: 'var(--color-warning)',
      btnHover: 'var(--color-warning-hover)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    info: {
      color: 'var(--color-info)',
      bgColor: 'var(--color-info-subtle)',
      btnBg: 'var(--color-primary)',
      btnHover: 'var(--color-primary-hover)',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      ),
    },
  }[type];

  const containerZIndex = zLevels ? zLevels.container : 99990;
  const maskZIndex = zLevels ? zLevels.mask : 99991;
  const panelZIndex = zLevels ? zLevels.panel : 99995;

  const containerTarget = (getContainer ? getContainer() : null) || (typeof document !== 'undefined' ? document.body : null);
  if (!containerTarget) return null;

  return createPortal(
    <div
      className={`confirm-dialog-root-wrapper modal-root-wrapper ${className}`.trim()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: containerZIndex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        pointerEvents: animateVisible ? 'auto' : 'none',
        background: 'transparent',
        backgroundColor: 'transparent',
      }}
    >
      {/* 遮罩 */}
      <div
        onClick={isLoading ? undefined : onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--color-bg-overlay, rgba(15, 23, 42, 0.38))',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          zIndex: maskZIndex,
          opacity: animateVisible ? 1 : 0,
          transition: 'opacity 220ms ease',
        }}
      />

      {/* 对话框面板 */}
      <div
        role="alertdialog"
        aria-modal="true"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '460px',
          background: 'var(--card-bg, #111827)',
          color: 'var(--text-color, #f3f4f6)',
          borderRadius: '14px',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          zIndex: panelZIndex,
          opacity: animateVisible ? 1 : 0,
          transform: animateVisible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(8px)',
          transition: 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部彩色装饰条 */}
        <div style={{ height: '3px', background: typeConfig.color, width: '100%' }} />

        <div style={{ padding: '24px' }}>
          {/* 图标与标题 */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: typeConfig.bgColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {typeConfig.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  color: 'var(--text-color, #f3f4f6)',
                  lineHeight: '1.4',
                }}
              >
                {title}
              </h3>
              {content && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '0.9rem',
                    color: 'var(--text-secondary, #94a3b8)',
                    lineHeight: '1.5',
                  }}
                >
                  {content}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div
          style={{
            padding: '12px 24px 20px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
              background: 'var(--bg-secondary, rgba(255, 255, 255, 0.05))',
              color: 'var(--text-color, #f3f4f6)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={isLoading}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: typeConfig.btnBg,
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.75 : 1,
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isLoading && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                style={{ animation: 'spin 1s linear infinite' }}
              >
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
            )}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>,
    containerTarget
  );
};

// Hook & Context 便捷调用支持
interface ConfirmOptions {
  title: string;
  content: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmType;
  getContainer?: () => HTMLElement;
  className?: string;
}

type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction | null>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode; getContainer?: () => HTMLElement }> = ({ children, getContainer }) => {
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback<ConfirmFunction>((options) => {
    return new Promise<boolean>((resolve) => {
      setDialogState({
        open: true,
        options,
        resolve,
      });
    });
  }, []);

  const handleClose = () => {
    if (dialogState) {
      dialogState.resolve(false);
      setDialogState(prev => prev ? { ...prev, open: false } : null);
    }
  };

  const handleConfirm = () => {
    if (dialogState) {
      dialogState.resolve(true);
      setDialogState(prev => prev ? { ...prev, open: false } : null);
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialogState && (
        <ConfirmDialog
          open={dialogState.open}
          onClose={handleClose}
          onConfirm={handleConfirm}
          title={dialogState.options.title}
          content={dialogState.options.content}
          confirmText={dialogState.options.confirmText}
          cancelText={dialogState.options.cancelText}
          type={dialogState.options.type}
          getContainer={dialogState.options.getContainer || getContainer}
          className={dialogState.options.className}
        />
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    console.warn('[ConfirmDialog] useConfirm was called outside of a ConfirmProvider. Falling back to native confirm.');
    return useCallback((options: ConfirmOptions) => {
      const msg = typeof options.content === 'string'
        ? `${options.title}\n\n${options.content}`
        : options.title;
      const ok = typeof window !== 'undefined' ? window.confirm(msg) : true;
      return Promise.resolve(ok);
    }, []);
  }
  return context;
};
