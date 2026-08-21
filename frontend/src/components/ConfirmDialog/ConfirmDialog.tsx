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

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: containerZIndex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        pointerEvents: animateVisible ? 'auto' : 'none',
      }}
    >
      {/* 遮罩 */}
      <div
        onClick={isLoading ? undefined : onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--color-bg-overlay, rgba(15, 23, 42, 0.65))',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
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
          borderRadius: '12px',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.5)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          zIndex: panelZIndex,
          transform: animateVisible ? 'scale(1)' : 'scale(0.95)',
          opacity: animateVisible ? 1 : 0,
          transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
          {/* 左侧图标 */}
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: typeConfig.bgColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {typeConfig.icon}
          </div>

          {/* 右侧文本区 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-color, #f3f4f6)' }}>
              {title}
            </h3>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5, wordBreak: 'break-word' }}>
              {content}
            </div>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
              background: 'transparent',
              color: 'var(--text-secondary, #94a3b8)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              if (!isLoading) {
                e.currentTarget.style.color = 'var(--text-color, #f3f4f6)';
                e.currentTarget.style.borderColor = 'var(--border-hover, rgba(255, 255, 255, 0.25))';
              }
            }}
            onMouseLeave={e => {
              if (!isLoading) {
                e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)';
                e.currentTarget.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.12))';
              }
            }}
          >
            {cancelText}
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={handleConfirmClick}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: typeConfig.btnBg,
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
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
    document.body
  );
};

// Hook & Context 便捷调用支持
interface ConfirmOptions {
  title: string;
  content: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmType;
}

type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction | null>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
