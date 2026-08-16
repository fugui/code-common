import React from 'react';

export type EmptyStateType = 'data' | 'search' | 'permission' | 'success' | 'error' | 'folder';

export interface EmptyStateProps {
  /** 空状态类型，默认为 'data' */
  type?: EmptyStateType;
  /** 标题 */
  title?: React.ReactNode;
  /** 详细描述说明 */
  description?: React.ReactNode;
  /** 自定义图标，覆盖内置预设 */
  icon?: React.ReactNode;
  /** 底部操作按钮/引导链接 */
  action?: React.ReactNode;
  /** 紧凑模式 (适用于侧边栏、卡片内嵌等狭窄区域) */
  compact?: boolean;
  /** 是否作为表格内嵌行直接输出 <tr><td colSpan={colSpan}>...</td></tr> */
  inTable?: boolean;
  /** 当 inTable 为 true 时的表格列跨度 */
  colSpan?: number;
  /** 自定义外层样式 */
  style?: React.CSSProperties;
  /** 自定义类名 */
  className?: string;
}

const DEFAULT_TITLES: Record<EmptyStateType, string> = {
  data: '暂无数据',
  search: '未找到匹配结果',
  permission: '暂无访问权限',
  success: '运行状态良好，暂无异常',
  error: '数据加载失败',
  folder: '目录下暂无文件',
};

const renderDefaultIcon = (type: EmptyStateType, compact: boolean) => {
  const size = compact ? 36 : 48;
  switch (type) {
    case 'search':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      );
    case 'permission':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case 'success':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'error':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case 'folder':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'data':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <line x1="9" y1="7" x2="15" y2="7" />
          <line x1="9" y1="11" x2="13" y2="11" />
        </svg>
      );
  }
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  type = 'data',
  title,
  description,
  icon,
  action,
  compact = false,
  inTable = false,
  colSpan,
  style,
  className = '',
}) => {
  const displayTitle = title !== undefined ? title : DEFAULT_TITLES[type];

  const content = (
    <div
      className={`empty-state-container ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: compact ? '1.5rem 1rem' : '3.5rem 1.5rem',
        textAlign: 'center',
        color: 'var(--text-secondary, #94a3b8)',
        ...style,
      }}
    >
      {/* 图标与背景光晕 */}
      <div
        style={{
          width: compact ? 56 : 72,
          height: compact ? 56 : 72,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: compact ? '0.75rem' : '1.25rem',
          color: 'var(--text-secondary, #64748b)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
        }}
      >
        {icon || renderDefaultIcon(type, compact)}
      </div>

      {/* 标题 */}
      {displayTitle && (
        <h4
          style={{
            margin: 0,
            fontSize: compact ? '0.9rem' : '1.05rem',
            fontWeight: 600,
            color: 'var(--text-color, var(--text-main, #f3f4f6))',
            letterSpacing: '-0.2px',
          }}
        >
          {displayTitle}
        </h4>
      )}

      {/* 描述说明 */}
      {description && (
        <p
          style={{
            margin: compact ? '0.25rem 0 0 0' : '0.5rem 0 0 0',
            fontSize: compact ? '0.8rem' : '0.875rem',
            color: 'var(--text-secondary, #64748b)',
            maxWidth: compact ? '240px' : '420px',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}

      {/* 引导操作 CTA */}
      {action && (
        <div style={{ marginTop: compact ? '0.875rem' : '1.25rem' }}>
          {action}
        </div>
      )}
    </div>
  );

  if (inTable) {
    return (
      <tr className="empty-state-row">
        <td colSpan={colSpan} style={{ padding: 0, border: 'none' }}>
          {content}
        </td>
      </tr>
    );
  }

  return content;
};
