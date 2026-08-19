import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SysAuditLog, AuditLevel } from '../../types/audit';
import { Pagination } from '../Pagination/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { EmptyState } from '../EmptyState';

export interface AuditLogTableProps {
  apiBaseUrl?: string; // 默认 /api/audit-logs
  onViewDetail?: (log: SysAuditLog) => void;
  headerExtra?: React.ReactNode;
}

export const AuditLogTable: React.FC<AuditLogTableProps> = ({
  apiBaseUrl = '/api/audit-logs',
  onViewDetail,
  headerExtra,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, pageSize } = usePagination({
    defaultPageSize: 25,
  });

  const [logs, setLogs] = useState<SysAuditLog[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // 筛选条件 (同步至 URL)
  const service = searchParams.get('service') || '';
  const level = searchParams.get('level') || '';
  const moduleParam = searchParams.get('module') || '';
  const searchParam = searchParams.get('search') || '';
  const startTime = searchParams.get('start_time') || '';
  const endTime = searchParams.get('end_time') || '';

  const [searchInput, setSearchInput] = useState<string>(searchParam);
  const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(searchParam);
  }, [searchParam]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (service) params.set('service', service);
      if (level) params.set('level', level);
      if (moduleParam) params.set('module', moduleParam);
      if (searchParam) params.set('search', searchParam);
      if (startTime) params.set('start_time', startTime);
      if (endTime) params.set('end_time', endTime);

      const res = await fetch(`${apiBaseUrl}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.items || data.logs || []);
        setTotal(data.total || 0);
      } else {
        setLogs([]);
        setTotal(0);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, page, pageSize, service, level, moduleParam, searchParam, startTime, endTime]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterChange = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    newParams.set('page', '1'); // 切换筛选项重置为第 1 页
    setSearchParams(newParams);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleFilterChange('search', searchInput.trim());
  };

  const handleResetFilters = () => {
    const newParams = new URLSearchParams();
    newParams.set('page', '1');
    newParams.set('pageSize', String(pageSize));
    setSearchInput('');
    setSearchParams(newParams);
  };

  const handleCopyTrace = (e: React.MouseEvent, traceId: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(traceId);
    setCopiedTraceId(traceId);
    setTimeout(() => setCopiedTraceId(null), 2000);
  };

  const renderLevelBadge = (lvl: AuditLevel) => {
    const styleMap: Record<string, { bg: string; text: string; border: string }> = {
      P0: { bg: 'rgba(239, 68, 68, 0.12)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
      P1: { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
      P2: { bg: 'rgba(100, 116, 139, 0.12)', text: '#64748b', border: 'rgba(100, 116, 139, 0.3)' },
    };
    const s = styleMap[lvl] || styleMap.P2;
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: 700,
        background: s.bg,
        color: s.text,
        border: `1px solid ${s.border}`,
      }}>
        {lvl === 'P0' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />}
        {lvl}
      </span>
    );
  };

  const renderServiceBadge = (svc: string) => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      bench: { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6' },
      pipeline: { bg: 'rgba(168, 85, 247, 0.1)', text: '#a855f7' },
      shield: { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981' },
      pdm: { bg: 'rgba(249, 115, 22, 0.1)', text: '#f97316' },
    };
    const s = colorMap[svc.toLowerCase()] || { bg: 'rgba(100, 116, 139, 0.1)', text: '#64748b' };
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: 600,
        background: s.bg,
        color: s.text,
      }}>
        {svc.toUpperCase()}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* 筛选与搜索工具栏 */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        padding: '1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
            {/* 服务筛选 */}
            <select
              value={service}
              onChange={e => handleFilterChange('service', e.target.value)}
              style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: 'var(--bg-color)', color: 'var(--text-color)' }}
            >
              <option value="">全部微服务</option>
              <option value="bench">CodeBench (统一底座)</option>
              <option value="pipeline">CodePipeline (持续构建)</option>
              <option value="shield">CodeShield (代码质量)</option>
              <option value="pdm">PDM (产品数据管理)</option>
            </select>

            {/* 风险等级筛选 */}
            <select
              value={level}
              onChange={e => handleFilterChange('level', e.target.value)}
              style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: 'var(--bg-color)', color: 'var(--text-color)' }}
            >
              <option value="">全部风险等级</option>
              <option value="P0">P0 (极高危操作)</option>
              <option value="P1">P1 (重要管理)</option>
              <option value="P2">P2 (常规操作)</option>
            </select>

            {/* 关键字搜索 */}
            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="搜索操作人、摘要、Trace ID、目标..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.85rem',
                  minWidth: '260px',
                  background: 'var(--bg-color)',
                  color: 'var(--text-color)',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--primary-color)',
                  color: 'white',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                搜索
              </button>
            </form>

            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              重置
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => fetchLogs()}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-color)',
                color: 'var(--text-color)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              刷新
            </button>
            {headerExtra}
          </div>
        </div>
      </div>

      {/* 审计日志数据表格 */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '0.875rem 1rem', width: '160px' }}>操作时间</th>
                <th style={{ padding: '0.875rem 1rem', width: '140px' }}>操作人</th>
                <th style={{ padding: '0.875rem 0.75rem', width: '90px' }}>服务</th>
                <th style={{ padding: '0.875rem 0.75rem', width: '130px' }}>模块 / 动作</th>
                <th style={{ padding: '0.875rem 0.75rem', width: '80px' }}>风险等级</th>
                <th style={{ padding: '0.875rem 1rem' }}>操作摘要</th>
                <th style={{ padding: '0.875rem 0.75rem', width: '150px' }}>目标对象</th>
                <th style={{ padding: '0.875rem 0.75rem', width: '110px' }}>状态 / 耗时</th>
                <th style={{ padding: '0.875rem 1rem', width: '110px', textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'inline-block', width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(59,130,246,0.2)', borderTop: '2px solid var(--primary-color)', animation: 'spin 0.8s linear infinite' }} />
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>正在加载全局操作审计日志...</div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <EmptyState
                  inTable
                  colSpan={9}
                  type="data"
                  title="暂无操作审计日志"
                  description="在系统内执行写操作或关键配置变更时，将自动在此留痕并记录 Diff 差异。"
                />
              ) : (
                logs.map(item => {
                  const isSuccess = item.status_code >= 200 && item.status_code < 300;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => onViewDetail && onViewDetail(item)}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        cursor: onViewDetail ? 'pointer' : 'default',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.03)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* 时间与 TraceID */}
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-color)', fontSize: '0.85rem' }}>
                          {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN', { hour12: false }) : '-'}
                        </div>
                        {item.trace_id && (
                          <div
                            onClick={e => handleCopyTrace(e, item.trace_id)}
                            style={{
                              fontSize: '0.7rem',
                              fontFamily: 'monospace',
                              color: copiedTraceId === item.trace_id ? '#10b981' : 'var(--text-secondary)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              marginTop: '2px'
                            }}
                            title="点击复制 Trace ID"
                          >
                            <span>{item.trace_id.slice(0, 8)}...</span>
                            <span>{copiedTraceId === item.trace_id ? '✓' : '📋'}</span>
                          </div>
                        )}
                      </td>

                      {/* 操作人 */}
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>{item.username || 'Anonymous'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {item.department_name || item.user_role || 'guest'}
                        </div>
                      </td>

                      {/* 所属服务 */}
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        {renderServiceBadge(item.service)}
                      </td>

                      {/* 模块 / 动作 */}
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-color)', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {item.module}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {item.action}
                        </div>
                      </td>

                      {/* 风险等级 */}
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        {renderLevelBadge(item.level)}
                      </td>

                      {/* 操作摘要 */}
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{
                          color: 'var(--text-color)',
                          fontWeight: 500,
                          wordBreak: 'break-word',
                          lineHeight: 1.4,
                          maxWidth: '380px'
                        }}>
                          {item.summary}
                        </div>
                      </td>

                      {/* 目标对象 */}
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        {item.target_name || item.target_id ? (
                          <div>
                            <div style={{ fontWeight: 500, color: 'var(--text-color)', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }} title={item.target_name || item.target_id}>
                              {item.target_name || item.target_id}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              {item.target_type || 'object'}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>-</span>
                        )}
                      </td>

                      {/* 状态码与耗时 */}
                      <td style={{ padding: '0.875rem 0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{
                            padding: '1px 5px',
                            borderRadius: '3px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: isSuccess ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: isSuccess ? '#10b981' : '#ef4444',
                          }}>
                            {item.status_code}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {item.duration_ms}ms
                          </span>
                        </div>
                      </td>

                      {/* 操作列 */}
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onViewDetail) onViewDetail(item);
                          }}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '5px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-color)',
                            color: 'var(--primary-color)',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          详情 Diff
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 分页栏 */}
        <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <Pagination totalItems={total} />
        </div>
      </div>
    </div>
  );
};
