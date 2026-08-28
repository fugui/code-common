import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SysAuditLog, AuditLevel } from '../../types/audit';
import { Pagination } from '../Pagination/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { EmptyState } from '../EmptyState';
import './audit-log-table.css';

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
    const lvlKey = (lvl || 'P2').toLowerCase();
    return (
      <span className={`code-audit-level-badge code-audit-level-badge--${lvlKey}`}>
        {lvl === 'P0' && <span className="code-audit-pulse-dot" />}
        {lvl}
      </span>
    );
  };

  const renderServiceBadge = (svc: string) => {
    const svcKey = (svc || '').toLowerCase();
    const svcClass = ['bench', 'pipeline', 'shield', 'pdm'].includes(svcKey)
      ? `code-audit-service-badge--${svcKey}`
      : 'code-audit-service-badge--default';
    return (
      <span className={`code-audit-service-badge ${svcClass}`}>
        {(svc || 'SYS').toUpperCase()}
      </span>
    );
  };

  return (
    <div className="code-audit-wrapper">
      {/* 筛选与搜索工具栏 */}
      <div className="code-audit-toolbar">
        <div className="code-audit-toolbar-row">
          <div className="code-audit-toolbar-left">
            {/* 服务筛选 */}
            <select
              value={service}
              onChange={e => handleFilterChange('service', e.target.value)}
              className="code-audit-select"
              aria-label="服务筛选"
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
              className="code-audit-select"
              aria-label="风险等级筛选"
            >
              <option value="">全部风险等级</option>
              <option value="P0">P0 (极高危操作)</option>
              <option value="P1">P1 (重要管理)</option>
              <option value="P2">P2 (常规操作)</option>
            </select>

            {/* 关键字搜索 */}
            <form onSubmit={handleSearchSubmit} className="code-audit-search-form">
              <input
                type="text"
                placeholder="搜索操作人、摘要、Trace ID、目标..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="code-audit-input"
              />
              <button
                type="submit"
                className="code-audit-btn-search"
              >
                搜索
              </button>
            </form>

            <button
              type="button"
              onClick={handleResetFilters}
              className="code-audit-btn-reset"
            >
              重置
            </button>
          </div>

          <div className="code-audit-toolbar-right">
            <button
              type="button"
              onClick={() => fetchLogs()}
              className="code-audit-btn-refresh"
            >
              刷新
            </button>
            {headerExtra}
          </div>
        </div>
      </div>

      {/* 审计日志数据表格 */}
      <div className="code-audit-table-card">
        <div className="code-audit-table-scroll">
          <table className="code-audit-table">
            <thead>
              <tr className="code-audit-thead-tr">
                <th className="code-audit-th" style={{ width: '160px' }}>操作时间</th>
                <th className="code-audit-th" style={{ width: '140px' }}>操作人</th>
                <th className="code-audit-th" style={{ width: '90px' }}>服务</th>
                <th className="code-audit-th" style={{ width: '130px' }}>模块 / 动作</th>
                <th className="code-audit-th" style={{ width: '80px' }}>风险等级</th>
                <th className="code-audit-th">操作摘要</th>
                <th className="code-audit-th" style={{ width: '150px' }}>目标对象</th>
                <th className="code-audit-th" style={{ width: '110px' }}>状态 / 耗时</th>
                <th className="code-audit-th" style={{ width: '110px', textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-secondary)' }}>
                    <div style={{ display: 'inline-block', width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--color-primary-subtle)', borderTop: '2px solid var(--color-primary)', animation: 'spin 0.8s linear infinite' }} />
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
                      className={`code-audit-tbody-tr ${onViewDetail ? 'code-audit-tbody-tr--clickable' : ''}`}
                    >
                      {/* 时间与 TraceID */}
                      <td className="code-audit-td">
                        <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '0.85rem' }}>
                          {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN', { hour12: false }) : '-'}
                        </div>
                        {item.trace_id && (
                          <div
                            onClick={e => handleCopyTrace(e, item.trace_id)}
                            className={`code-audit-trace-btn ${copiedTraceId === item.trace_id ? 'code-audit-trace-btn--copied' : ''}`}
                            title="点击复制 Trace ID"
                          >
                            <span>{item.trace_id.slice(0, 8)}...</span>
                            <span>{copiedTraceId === item.trace_id ? '✓' : '📋'}</span>
                          </div>
                        )}
                      </td>

                      {/* 操作人 */}
                      <td className="code-audit-td">
                        <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.username || 'Anonymous'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                          {item.department_name || item.user_role || 'guest'}
                        </div>
                      </td>

                      {/* 所属服务 */}
                      <td className="code-audit-td">
                        {renderServiceBadge(item.service)}
                      </td>

                      {/* 模块 / 动作 */}
                      <td className="code-audit-td">
                        <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono, monospace)', fontSize: '0.8rem' }}>
                          {item.module}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                          {item.action}
                        </div>
                      </td>

                      {/* 风险等级 */}
                      <td className="code-audit-td">
                        {renderLevelBadge(item.level)}
                      </td>

                      {/* 操作摘要 */}
                      <td className="code-audit-td">
                        <div style={{
                          color: 'var(--color-text-primary)',
                          fontWeight: 500,
                          wordBreak: 'break-word',
                          lineHeight: 1.4,
                          maxWidth: '380px'
                        }}>
                          {item.summary}
                        </div>
                      </td>

                      {/* 目标对象 */}
                      <td className="code-audit-td">
                        {item.target_name || item.target_id ? (
                          <div>
                            <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }} title={item.target_name || item.target_id}>
                              {item.target_name || item.target_id}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                              {item.target_type || 'object'}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-text-secondary)' }}>-</span>
                        )}
                      </td>

                      {/* 状态码与耗时 */}
                      <td className="code-audit-td">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{
                            padding: '1px 5px',
                            borderRadius: '3px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: isSuccess ? 'var(--color-success-subtle)' : 'var(--color-danger-subtle)',
                            color: isSuccess ? 'var(--color-success)' : 'var(--color-danger)',
                          }}>
                            {item.status_code}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                            {item.duration_ms}ms
                          </span>
                        </div>
                      </td>

                      {/* 操作列 */}
                      <td className="code-audit-td" style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onViewDetail) onViewDetail(item);
                          }}
                          className="code-audit-btn-detail"
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
        <div className="code-audit-pagination-wrapper">
          <Pagination totalItems={total} />
        </div>
      </div>
    </div>
  );
};
