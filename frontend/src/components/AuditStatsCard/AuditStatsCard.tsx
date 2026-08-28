import React from 'react';
import { AuditStats } from '../../types/audit';
import './audit-stats-card.css';

export interface AuditStatsCardProps {
  stats: AuditStats | null;
  loading?: boolean;
}

export const AuditStatsCard: React.FC<AuditStatsCardProps> = ({ stats, loading = false }) => {
  if (loading || !stats) {
    return (
      <div className="code-audit-stats-grid">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="code-audit-stats-card--skeleton">
            <div className="code-audit-stats-skeleton-line code-audit-stats-skeleton-line--title" />
            <div className="code-audit-stats-skeleton-line code-audit-stats-skeleton-line--val" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: '今日操作总数',
      value: stats.today_logs ?? 0,
      sub: `历史累计 ${stats.total_logs ?? 0} 次操作`,
      color: 'var(--color-primary)',
    },
    {
      title: 'P0 极高危操作',
      value: stats.p0_count ?? 0,
      sub: '权限提升 / 规则篡改 / 日志清理',
      color: 'var(--color-danger)',
    },
    {
      title: 'P1 重要管理变更',
      value: stats.p1_count ?? 0,
      sub: '方案同步 / 组织架构 / 档案资产',
      color: 'var(--color-warning)',
    },
    {
      title: 'P2 常规业务操作',
      value: stats.p2_count ?? 0,
      sub: '常规业务触发与配置',
      color: 'var(--color-text-muted)',
    },
  ];

  return (
    <div className="code-audit-stats-grid">
      {cards.map(c => (
        <div key={c.title} className="code-audit-stats-card">
          <div className="code-audit-stats-header">
            <span className="code-audit-stats-title">{c.title}</span>
            <span className="code-audit-stats-dot" style={{ backgroundColor: c.color }} />
          </div>
          <div>
            <div className="code-audit-stats-value" style={{ color: c.color }}>
              {c.value.toLocaleString()}
            </div>
            <div className="code-audit-stats-sub">
              {c.sub}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
