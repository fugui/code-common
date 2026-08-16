import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

export type ConfirmType = 'danger' | 'warning' | 'info';

export interface ConfirmOptions {
  /** 弹窗标题 */
  title?: React.ReactNode;
  /** 弹窗正文内容或说明 */
  content?: React.ReactNode;
  /** 危险等级：danger (红) | warning (黄) | info (蓝) */
  type?: ConfirmType;
  /** 确认按钮文字，默认 "确认" */
  confirmText?: string;
  /** 取消按钮文字，默认 "取消" */
  cancelText?: string;
  /** 是否展示取消按钮，默认 true */
  showCancel?: boolean;
  /** 点击确认时的异步/同步回调 (若为 Promise 会自动进入 loading 态) */
  onConfirm?: () => void | Promise<unknown>;
}

export interface ConfirmDialogProps extends ConfirmOptions {
  /** 控制弹窗显隐 */
  open: boolean;
  /** 关闭/取消回调 */
  onClose: () => void;
  /** 手动指定的 loading 状态 */
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  title = '请确认操作',
  content,
  type = 'warning',
  confirmText = '确认',
  cancelText = '取消',
  showCancel = true,
  loading: externalLoading,
  onConfirm,
}) => {
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = externalLoading !== undefined ? externalLoading : internalLoading;

  const [mounted, setMounted] = useState(open);
  const [animateVisible, setAnimateVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const timer = window.setTimeout(() => setAnimateVisible(true), 16);
      return () => window.clearTimeout(timer);
    } else {
      setAnimateVisible(false);
      const timer = window.setTimeout(() => setMounted(false), 240);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  // ESC 键退出
  useEffect(() => {
    if (!mounted || !animateVisible || isLoading) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mounted, animateVisible, isLoading, onClose]);

  // 滚动锁定
  useEffect(() => {
    if (!mounted) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
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
      color: '#ef4444',
      bgColor: 'rgba(239, 68, 68, 0.12)',
      btnBg: '#dc2626',
      btnHover: '#b91c1c',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    },
    warning: {
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.12)',
      btnBg: '#d97706',
      btnHover: '#b45309',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    info: {
      color: '#3b82f6',
      bgColor: 'rgba(59, 130, 246, 0.12)',
      btnBg: '#2563eb',
      btnHover: '#1d4ed8',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      ),
    },
  }[type];

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
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
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)',
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
          zIndex: 100000,
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

          {/* 标题与描述 */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-color, #f3f4f6)' }}>
              {title}
            </h4>
            {content && (
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                {content}
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          {showCancel && (
            <button
              type="button"
              disabled={isLoading}
              onClick={onClose}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                borderRadius: '6px',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                background: 'var(--bg-secondary, transparent)',
                color: 'var(--text-color, #cbd5e1)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            disabled={isLoading}
            onClick={handleConfirmClick}
            style={{
              padding: '0.5rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              borderRadius: '6px',
              border: 'none',
              background: typeConfig.btnBg,
              color: '#ffffff',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.8 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.15s ease',
            }}
          >
            {isLoading && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                style={{ animation: 'spin 1s linear infinite' }}
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {confirmText}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>,
    document.body
  );
};

// ==================== Context & Hook 封装 ====================

type ConfirmResolver = (result: boolean) => void;

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // 降级兜底：未包裹 Provider 时自动退回到 window.confirm
    return async (options: ConfirmOptions) => {
      const msg = typeof options.content === 'string'
        ? `${options.title}\n\n${options.content}`
        : `${options.title || '确认操作？'}`;
      const ok = window.confirm(msg);
      if (ok && options.onConfirm) {
        await options.onConfirm();
      }
      return ok;
    };
  }
  return ctx.confirm;
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    options: ConfirmOptions;
    resolve?: ConfirmResolver;
  }>({
    open: false,
    options: {},
  });

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setDialogState({
        open: true,
        options,
        resolve,
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    if (dialogState.resolve) {
      dialogState.resolve(false);
    }
    setDialogState(prev => ({ ...prev, open: false }));
  }, [dialogState]);

  const handleConfirm = useCallback(async () => {
    if (dialogState.options.onConfirm) {
      await dialogState.options.onConfirm();
    }
    if (dialogState.resolve) {
      dialogState.resolve(true);
    }
    setDialogState(prev => ({ ...prev, open: false }));
  }, [dialogState]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {dialogState.open && (
        <ConfirmDialog
          open={dialogState.open}
          {...dialogState.options}
          onClose={handleClose}
          onConfirm={handleConfirm}
        />
      )}
    </ConfirmContext.Provider>
  );
};
