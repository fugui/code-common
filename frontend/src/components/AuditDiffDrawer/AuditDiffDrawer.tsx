import React, { useState, useEffect } from 'react';
import { Drawer } from '../Drawer';
import { SysAuditLog, FieldDiff } from '../../types/audit';
import './audit-diff-drawer.css';

export interface AuditDiffDrawerProps {
  open: boolean;
  onClose: () => void;
  log: SysAuditLog | null;
}

interface TriggerBatchDetail {
  trigger_log?: {
    id: number;
    trigger_batch: string;
    trigger_type: string;
    target_summary: string;
    total_repos: number;
    success_count: number;
    skip_count: number;
    created_at: string;
  };
  execution_logs?: Array<{
    id: number;
    repo?: {
      id: number;
      name: string;
      url: string;
      branch: string;
    };
    status: string;
    start_time: string;
    end_time?: string;
    task_report?: {
      id: number;
      score: number;
      status: string;
      ai_summary: string;
    };
  }>;
}

export const AuditDiffDrawer: React.FC<AuditDiffDrawerProps> = ({ open, onClose, log }) => {
  const [activeTab, setActiveTab] = useState<'diff' | 'raw_before' | 'raw_after'>('diff');
  const [copiedTrace, setCopiedTrace] = useState(false);
  const [triggerDetail, setTriggerDetail] = useState<TriggerBatchDetail | null>(null);
  const [loadingTrigger, setLoadingTrigger] = useState(false);

  // 解析 Diff Summary JSON
  const diffs: FieldDiff[] = React.useMemo(() => {
    if (!log?.diff_summary) return [];
    try {
      const parsed = JSON.parse(log.diff_summary);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [log?.diff_summary]);

  // 格式化 JSON 字符串
  const formattedBefore = React.useMemo(() => {
    if (!log?.before_data) return '';
    try {
      return JSON.stringify(JSON.parse(log.before_data), null, 2);
    } catch {
      return log.before_data;
    }
  }, [log?.before_data]);

  const formattedAfter = React.useMemo(() => {
    if (!log?.after_data) return '';
    try {
      return JSON.stringify(JSON.parse(log.after_data), null, 2);
    } catch {
      return log.after_data;
    }
  }, [log?.after_data]);

  // 复制 TraceID
  const handleCopyTrace = () => {
    if (log?.trace_id) {
      navigator.clipboard.writeText(log.trace_id);
      setCopiedTrace(true);
      setTimeout(() => setCopiedTrace(false), 2000);
    }
  };

  // 识别到 task_trigger_log 时，自动异步下钻拉取二级执行明细
  useEffect(() => {
    if (open && log && log.target_type === 'task_trigger_log' && log.target_id) {
      setLoadingTrigger(true);
      const url = `/shield/api/trigger-logs/${log.target_id}`;
      fetch(url)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setTriggerDetail(data);
          } else {
            // 回退尝试直接访问 /api/trigger-logs/:id
            fetch(`/api/trigger-logs/${log.target_id}`)
              .then(r => r.ok ? r.json() : null)
              .then(d => setTriggerDetail(d))
              .catch(() => setTriggerDetail(null));
          }
        })
        .catch(() => setTriggerDetail(null))
        .finally(() => setLoadingTrigger(false));
    } else {
      setTriggerDetail(null);
    }
  }, [open, log]);

  if (!log) return null;

  const lvlKey = (log.level || 'P2').toLowerCase();
  const isSuccess = log.status_code >= 200 && log.status_code < 300;

  const svcKey = (log.service || '').toLowerCase();
  const svcClass = ['bench', 'pipeline', 'shield', 'pdm'].includes(svcKey)
    ? `code-audit-service-badge--${svcKey}`
    : 'code-audit-service-badge--default';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="min(860px, 94vw)"
      title={
        <div className="code-audit-diff-header-title">
          <span className="code-audit-diff-title-text">
            操作审计详情 #{log.id}
          </span>
          <span className={`code-audit-level-badge code-audit-level-badge--${lvlKey}`}>
            {log.level} 等级
          </span>
          <span className={`code-audit-service-badge ${svcClass}`}>
            {log.service.toUpperCase()}
          </span>
        </div>
      }
      subtitle={
        <div className="code-audit-diff-header-subtitle">
          <span>时间: {log.created_at ? new Date(log.created_at).toLocaleString('zh-CN', { hour12: false }) : '-'}</span>
          <span>•</span>
          <span>操作人: {log.username} ({log.user_role || 'user'})</span>
        </div>
      }
    >
      <div className="code-audit-diff-body">
        {/* 1. 核心元数据卡片 (5W1H) */}
        <div className="code-audit-diff-meta-card">
          <div>
            <div className="code-audit-diff-field-label">操作摘要 (Summary)</div>
            <div className="code-audit-diff-field-val">{log.summary}</div>
          </div>
          <div>
            <div className="code-audit-diff-field-label">业务模块与动作 (Module / Action)</div>
            <div className="code-audit-diff-field-val">
              <code>{log.module}</code> / <code style={{ color: 'var(--color-primary)' }}>{log.action}</code>
            </div>
          </div>
          <div>
            <div className="code-audit-diff-field-label">目标对象 (Target)</div>
            <div className="code-audit-diff-field-val">
              {log.target_name || log.target_id ? (
                <span>{log.target_name || log.target_id} <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>({log.target_type || 'object'})</span></span>
              ) : (
                <span style={{ color: 'var(--color-text-secondary)' }}>-</span>
              )}
            </div>
          </div>
          <div>
            <div className="code-audit-diff-field-label">执行结果与耗时 (Result)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: isSuccess ? 'var(--color-success-subtle)' : 'var(--color-danger-subtle)',
                color: isSuccess ? 'var(--color-success)' : 'var(--color-danger)',
              }}>
                HTTP {log.status_code}
              </span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{log.duration_ms} ms</span>
            </div>
          </div>
          <div>
            <div className="code-audit-diff-field-label">网络环境 (IP / User-Agent)</div>
            <div className="code-audit-diff-ip">
              {log.client_ip}
            </div>
          </div>
          <div>
            <div className="code-audit-diff-field-label">全链路追踪 ID (Trace ID)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <code style={{ fontSize: '0.75rem', color: 'var(--color-primary)', wordBreak: 'break-all' }}>
                {log.trace_id || '-'}
              </code>
              {log.trace_id && (
                <button
                  type="button"
                  onClick={handleCopyTrace}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: copiedTrace ? 'var(--color-success)' : 'var(--color-text-secondary)',
                    padding: '2px',
                    fontSize: '0.75rem'
                  }}
                  title="复制 Trace ID"
                >
                  {copiedTrace ? '已复制' : '复制'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 错误提示卡片 (若有) */}
        {log.error_message && (
          <div className="code-audit-diff-error-card">
            <div className="code-audit-diff-error-title">错误详情 (Error Message):</div>
            <pre className="code-audit-diff-error-pre">{log.error_message}</pre>
          </div>
        )}

        {/* 2. 二级明细下钻：针对 TaskTriggerLog 的联动呈现 */}
        {log.target_type === 'task_trigger_log' && (
          <div className="code-audit-diff-batch-card">
            <div className="code-audit-diff-batch-header">
              <h4 className="code-audit-diff-batch-title">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)' }} />
                关联扫描批次二级执行明细 (Task Trigger Log #{log.target_id})
              </h4>
              {loadingTrigger && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>正在拉取明细...</span>}
            </div>

            {triggerDetail ? (
              <div>
                <div className="code-audit-diff-batch-stats">
                  <span>批次号: <strong style={{ color: 'var(--color-text-primary)' }}>{triggerDetail.trigger_log?.trigger_batch}</strong></span>
                  <span>总代码仓: <strong style={{ color: 'var(--color-text-primary)' }}>{triggerDetail.trigger_log?.total_repos || 0}</strong></span>
                  <span>成功扫描: <strong style={{ color: 'var(--color-success)' }}>{triggerDetail.trigger_log?.success_count || 0}</strong></span>
                  <span>跳过/排队: <strong style={{ color: 'var(--color-warning)' }}>{triggerDetail.trigger_log?.skip_count || 0}</strong></span>
                </div>

                {triggerDetail.execution_logs && triggerDetail.execution_logs.length > 0 ? (
                  <div className="code-audit-diff-batch-list">
                    {triggerDetail.execution_logs.map(exec => (
                      <div key={exec.id} className="code-audit-diff-batch-item">
                        <div>
                          <strong style={{ color: 'var(--color-text-primary)' }}>{exec.repo?.name || '未知仓库'}</strong>
                          <span style={{ color: 'var(--color-text-secondary)', marginLeft: '8px', fontSize: '0.75rem' }}>分支: {exec.repo?.branch || 'master'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {exec.task_report && (
                            <span style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.8rem' }}>
                              得分: {exec.task_report.score}
                            </span>
                          )}
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            background: exec.status === 'completed' ? 'var(--color-success-subtle)' : 'var(--color-primary-subtle)',
                            color: exec.status === 'completed' ? 'var(--color-success)' : 'var(--color-primary)',
                          }}>
                            {exec.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>该批次暂无二级执行仓库记录</div>
                )}
              </div>
            ) : !loadingTrigger ? (
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>未获取到二级扫描批次详情</div>
            ) : null}
          </div>
        )}

        {/* 3. 结构化 Diff 对比视图 */}
        <div className="code-audit-diff-tabs-card">
          {/* Diff Tab 切换条 */}
          <div className="code-audit-diff-tabs-bar">
            <button
              type="button"
              onClick={() => setActiveTab('diff')}
              className={`code-audit-diff-tab-btn ${activeTab === 'diff' ? 'code-audit-diff-tab-btn--active' : ''}`}
            >
              结构化差异对比 {diffs.length > 0 && `(${diffs.length})`}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('raw_before')}
              className={`code-audit-diff-tab-btn ${activeTab === 'raw_before' ? 'code-audit-diff-tab-btn--active' : ''}`}
            >
              变更前原始快照 (Before)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('raw_after')}
              className={`code-audit-diff-tab-btn ${activeTab === 'raw_after' ? 'code-audit-diff-tab-btn--active' : ''}`}
            >
              变更后原始快照 (After)
            </button>
          </div>

          <div className="code-audit-diff-tab-content">
            {activeTab === 'diff' && (
              <div>
                {diffs.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                        <th style={{ padding: '0.6rem 0.75rem', width: '22%' }}>变更字段</th>
                        <th style={{ padding: '0.6rem 0.75rem', width: '12%' }}>变动类型</th>
                        <th style={{ padding: '0.6rem 0.75rem', width: '33%' }}>变更前 (Before)</th>
                        <th style={{ padding: '0.6rem 0.75rem', width: '33%' }}>变更后 (After)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diffs.map((d, idx) => {
                        const actionStyle = {
                          added: { bg: 'var(--color-success-subtle)', text: 'var(--color-success)', label: '新增 (Added)' },
                          modified: { bg: 'var(--color-warning-subtle)', text: 'var(--color-warning)', label: '修改 (Modified)' },
                          removed: { bg: 'var(--color-danger-subtle)', text: 'var(--color-danger)', label: '删除 (Removed)' },
                        }[d.action] || { bg: 'var(--color-bg-muted)', text: 'var(--color-text-secondary)', label: d.action };

                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono, monospace)' }}>
                              {d.field}
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                background: actionStyle.bg,
                                color: actionStyle.text,
                              }}>
                                {actionStyle.label}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem', color: d.action === 'removed' ? 'var(--color-danger)' : 'var(--color-text-secondary)', fontFamily: 'var(--font-family-mono, monospace)', wordBreak: 'break-all' }}>
                              {d.old_val !== null && d.old_val !== undefined ? (
                                typeof d.old_val === 'object' ? JSON.stringify(d.old_val) : String(d.old_val)
                              ) : (
                                <span style={{ opacity: 0.4 }}>null</span>
                              )}
                            </td>
                            <td style={{ padding: '0.75rem', color: d.action === 'added' ? 'var(--color-success)' : 'var(--color-text-primary)', fontFamily: 'var(--font-family-mono, monospace)', wordBreak: 'break-all' }}>
                              {d.new_val !== null && d.new_val !== undefined ? (
                                typeof d.new_val === 'object' ? JSON.stringify(d.new_val) : String(d.new_val)
                              ) : (
                                <span style={{ opacity: 0.4 }}>null</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                    {log.before_data || log.after_data ? '未产生结构化键值变化（或快照为同等值）' : '无快照对比数据'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'raw_before' && (
              <div>
                {formattedBefore ? (
                  <pre className="code-audit-diff-raw-pre">
                    {formattedBefore}
                  </pre>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>无变更前快照数据</div>
                )}
              </div>
            )}

            {activeTab === 'raw_after' && (
              <div>
                {formattedAfter ? (
                  <pre className="code-audit-diff-raw-pre">
                    {formattedAfter}
                  </pre>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>无变更后快照数据</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
};
