import { createContext, useContext, useState, ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000); // Auto-dismiss after 3 seconds
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div 
        style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 999999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          pointerEvents: 'none'
        }}
      >
        {toasts.map(toast => {
          let bg = 'var(--color-info, #2563eb)'; // info / default
          let icon = 'ℹ️';
          if (toast.type === 'success') {
            bg = 'var(--color-success, #10b981)';
            icon = '✅';
          } else if (toast.type === 'error') {
            bg = 'var(--color-danger, #ef4444)';
            icon = '❌';
          } else if (toast.type === 'warning') {
            bg = 'var(--color-warning, #f59e0b)';
            icon = '⚠️';
          }

          return (
            <div 
              key={toast.id}
              style={{
                background: bg,
                color: 'white',
                padding: '12px 20px',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                animation: 'toast-slide-in 0.3s ease-out forwards',
                fontSize: '0.875rem',
                fontWeight: 500,
                minWidth: '250px'
              }}
            >
              <span>{icon}</span>
              <span>{toast.message}</span>
            </div>
          );
        })}
      </div>
      <style>
        {`
        @keyframes toast-slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        `}
      </style>
    </ToastContext.Provider>
  );
};
