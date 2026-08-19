import React from 'react';
import { AuditStats } from '../../types/audit';

export interface AuditStatsCardProps {
  stats: AuditStats | null;
  loading?: boolean;
}

export const AuditStatsCard: React.FC<AuditStatsCardProps> = ({ stats, loading = false }) => {
  if (loading || !stats) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '1.25rem',
            height: '80px',
            opacity: 0.6
          }}>
            <div style={{ width: '40%', height: '14px', background: 'var(--border-color)', borderRadius: '4px', marginBottom: '8px' }} />
            <div style={{ width: '60%', height: '24px', background: 'var(--border-color)', borderRadius: '4px' }} />
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
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.08)',
    },
    {
      title: 'P0 极高危操作',
      value: stats.p0_count ?? 0,
      sub: '权限提升 / 规则篡改 / 日志清理',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.08)',
    },
    {
      title: 'P1 重要管理变更',
      value: stats.p1_count ?? 0,
      sub: '方案同步 / 组织架构 / 档案资产',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.08)',
    },
    {
      title: 'P2 常规业务操作',
      value: stats.p2_count ?? 0,
      sub: '常规业务触发与配置',
      color: '#64748b',
      bg: 'rgba(100, 116, 139, 0.08)',
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '1rem',
      marginBottom: '1.5rem'
    }}>
      {cards.map(c => (
        <div
          key={c.title}
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{c.title}</span>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: c.color,
            }} />
          </div>
          <div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: c.color, lineHeight: 1.2 }}>
              {c.value.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {c.sub}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
