import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { zIndexManager, escManager, lockBodyScroll, unlockBodyScroll, ZIndexLevels } from '../../utils/overlay';
import './confirm-dialog.css';

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
  const uniqueTitleId = useId();
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

  const handleConfirmClick = async () => {
    if (!onConfirm || isLoading) return;
    try {
      setInternalLoading(true);
      await onConfirm();
      onClose();
    } catch (e) {
      console.error('[ConfirmDialog] onConfirm failed:', e);
    } finally {
      setInternalLoading(false);
    }
  };

  if (!mounted && !open) return null;

  const typeIcon = {
    danger: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    warning: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    info: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  }[type];

  const containerZIndex = zLevels ? zLevels.container : 99990;
  const maskZIndex = zLevels ? zLevels.mask : 99991;
  const panelZIndex = zLevels ? zLevels.panel : 99995;

  const containerTarget = (getContainer ? getContainer() : null) || (typeof document !== 'undefined' ? document.body : null);
  if (!containerTarget) return null;

  const pointerClass = animateVisible ? 'code-confirm-dialog-root--pointer-auto' : 'code-confirm-dialog-root--pointer-none';

  return createPortal(
    <div
      className={`code-confirm-dialog-root confirm-dialog-root-wrapper modal-root-wrapper ${pointerClass} ${className}`.trim()}
      style={{ zIndex: containerZIndex }}
    >
      {/* 遮罩 */}
      <div
        className={`code-confirm-dialog-mask ${animateVisible ? 'code-confirm-dialog-mask--visible' : ''}`}
        onClick={isLoading ? undefined : onClose}
        style={{ zIndex: maskZIndex }}
      />

      {/* 对话框面板 */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={uniqueTitleId}
        className={`code-confirm-dialog-panel ${animateVisible ? 'code-confirm-dialog-panel--visible' : 'code-confirm-dialog-panel--hidden'}`}
        style={{ zIndex: panelZIndex }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部彩色装饰条 */}
        <div className={`code-confirm-dialog-decorator code-confirm-dialog-decorator--${type}`} />

        <div className="code-confirm-dialog-body">
          {/* 图标与标题 */}
          <div className={`code-confirm-dialog-icon code-confirm-dialog-icon--${type}`}>
            {typeIcon}
          </div>
          <div className="code-confirm-dialog-text">
            <h3 id={uniqueTitleId} className="code-confirm-dialog-title">
              {title}
            </h3>
            {content && (
              <div className="code-confirm-dialog-content">
                {content}
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="code-confirm-dialog-footer">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="code-confirm-dialog-btn-cancel"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={isLoading}
            className={`code-confirm-dialog-btn-confirm code-confirm-dialog-btn-confirm--${type}`}
          >
            {isLoading && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="code-confirm-dialog-spinner"
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
