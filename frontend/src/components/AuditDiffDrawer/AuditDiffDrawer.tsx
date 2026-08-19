import React, { useState, useEffect } from 'react';
import { Drawer } from '../Drawer';
import { SysAuditLog, FieldDiff } from '../../types/audit';

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

  const levelColorMap: Record<string, { bg: string; text: string; border: string }> = {
    P0: { bg: 'rgba(239, 68, 68, 0.12)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
    P1: { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
    P2: { bg: 'rgba(100, 116, 139, 0.12)', text: '#64748b', border: 'rgba(100, 116, 139, 0.3)' },
  };
  const levelStyle = levelColorMap[log.level] || levelColorMap.P2;

  const isSuccess = log.status_code >= 200 && log.status_code < 300;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="min(860px, 94vw)"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-color)' }}>
            操作审计详情 #{log.id}
          </span>
          <span style={{
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 700,
            background: levelStyle.bg,
            color: levelStyle.text,
            border: `1px solid ${levelStyle.border}`,
          }}>
            {log.level} 等级
          </span>
          <span style={{
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: 'rgba(59, 130, 246, 0.1)',
            color: 'var(--primary-color)',
          }}>
            {log.service.toUpperCase()}
          </span>
        </div>
      }
      subtitle={
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
          <span>时间: {log.created_at ? new Date(log.created_at).toLocaleString('zh-CN', { hour12: false }) : '-'}</span>
          <span>•</span>
          <span>操作人: {log.username} ({log.user_role || 'user'})</span>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* 1. 核心元数据卡片 (5W1H) */}
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '1.25rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          fontSize: '0.875rem'
        }}>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px' }}>操作摘要 (Summary)</div>
            <div style={{ fontWeight: 600, color: 'var(--text-color)', wordBreak: 'break-word' }}>{log.summary}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px' }}>业务模块与动作 (Module / Action)</div>
            <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>
              <code>{log.module}</code> / <code style={{ color: 'var(--primary-color)' }}>{log.action}</code>
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px' }}>目标对象 (Target)</div>
            <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>
              {log.target_name || log.target_id ? (
                <span>{log.target_name || log.target_id} <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>({log.target_type || 'object'})</span></span>
              ) : (
                <span style={{ color: 'var(--text-secondary)' }}>-</span>
              )}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px' }}>执行结果与耗时 (Result)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: isSuccess ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: isSuccess ? '#10b981' : '#ef4444',
              }}>
                HTTP {log.status_code}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>{log.duration_ms} ms</span>
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px' }}>网络环境 (IP / User-Agent)</div>
            <div style={{ color: 'var(--text-color)', fontFamily: 'monospace', fontSize: '0.8rem' }}>
              {log.client_ip}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px' }}>全链路追踪 ID (Trace ID)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <code style={{ fontSize: '0.75rem', color: 'var(--primary-color)', wordBreak: 'break-all' }}>
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
                    color: copiedTrace ? '#10b981' : 'var(--text-secondary)',
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
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '8px',
            padding: '0.875rem 1rem',
            color: '#ef4444',
            fontSize: '0.85rem'
          }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>错误详情 (Error Message):</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.error_message}</pre>
          </div>
        )}

        {/* 2. 二级明细下钻：针对 TaskTriggerLog 的联动呈现 */}
        {log.target_type === 'task_trigger_log' && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.04)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '10px',
            padding: '1.25rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-color)' }}></span>
                关联扫描批次二级执行明细 (Task Trigger Log #{log.target_id})
              </h4>
              {loadingTrigger && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>正在拉取明细...</span>}
            </div>

            {triggerDetail ? (
              <div>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  <span>批次号: <strong style={{ color: 'var(--text-color)' }}>{triggerDetail.trigger_log?.trigger_batch}</strong></span>
                  <span>总代码仓: <strong style={{ color: 'var(--text-color)' }}>{triggerDetail.trigger_log?.total_repos || 0}</strong></span>
                  <span>成功扫描: <strong style={{ color: '#10b981' }}>{triggerDetail.trigger_log?.success_count || 0}</strong></span>
                  <span>跳过/排队: <strong style={{ color: '#f59e0b' }}>{triggerDetail.trigger_log?.skip_count || 0}</strong></span>
                </div>

                {triggerDetail.execution_logs && triggerDetail.execution_logs.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '240px', overflowY: 'auto' }}>
                    {triggerDetail.execution_logs.map(exec => (
                      <div key={exec.id} style={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '0.6rem 0.875rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.85rem'
                      }}>
                        <div>
                          <strong style={{ color: 'var(--text-color)' }}>{exec.repo?.name || '未知仓库'}</strong>
                          <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '0.75rem' }}>分支: {exec.repo?.branch || 'master'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {exec.task_report && (
                            <span style={{ color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.8rem' }}>
                              得分: {exec.task_report.score}
                            </span>
                          )}
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            background: exec.status === 'completed' ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
                            color: exec.status === 'completed' ? '#10b981' : 'var(--primary-color)',
                          }}>
                            {exec.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>该批次暂无二级执行仓库记录</div>
                )}
              </div>
            ) : !loadingTrigger ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>未获取到二级扫描批次详情</div>
            ) : null}
          </div>
        )}

        {/* 3. 结构化 Diff 对比视图 */}
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
          {/* Diff Tab 切换条 */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-color)',
            padding: '0 0.5rem'
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('diff')}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'transparent',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: activeTab === 'diff' ? 'var(--primary-color)' : 'var(--text-secondary)',
                borderBottom: activeTab === 'diff' ? '2px solid var(--primary-color)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              结构化差异对比 {diffs.length > 0 && `(${diffs.length})`}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('raw_before')}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'transparent',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: activeTab === 'raw_before' ? 'var(--primary-color)' : 'var(--text-secondary)',
                borderBottom: activeTab === 'raw_before' ? '2px solid var(--primary-color)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              变更前原始快照 (Before)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('raw_after')}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'transparent',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: activeTab === 'raw_after' ? 'var(--primary-color)' : 'var(--text-secondary)',
                borderBottom: activeTab === 'raw_after' ? '2px solid var(--primary-color)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              变更后原始快照 (After)
            </button>
          </div>

          <div style={{ padding: '1.25rem' }}>
            {activeTab === 'diff' && (
              <div>
                {diffs.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                        <th style={{ padding: '0.6rem 0.75rem', width: '22%' }}>变更字段</th>
                        <th style={{ padding: '0.6rem 0.75rem', width: '12%' }}>变动类型</th>
                        <th style={{ padding: '0.6rem 0.75rem', width: '33%' }}>变更前 (Before)</th>
                        <th style={{ padding: '0.6rem 0.75rem', width: '33%' }}>变更后 (After)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diffs.map((d, idx) => {
                        const actionStyle = {
                          added: { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981', label: '新增 (Added)' },
                          modified: { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b', label: '修改 (Modified)' },
                          removed: { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444', label: '删除 (Removed)' },
                        }[d.action] || { bg: 'rgba(100, 116, 139, 0.1)', text: '#64748b', label: d.action };

                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-color)', fontFamily: 'monospace' }}>
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
                            <td style={{ padding: '0.75rem', color: d.action === 'removed' ? '#ef4444' : 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                              {d.old_val !== null && d.old_val !== undefined ? (
                                typeof d.old_val === 'object' ? JSON.stringify(d.old_val) : String(d.old_val)
                              ) : (
                                <span style={{ opacity: 0.4 }}>null</span>
                              )}
                            </td>
                            <td style={{ padding: '0.75rem', color: d.action === 'added' ? '#10b981' : 'var(--text-color)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
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
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {log.before_data || log.after_data ? '未产生结构化键值变化（或快照为同等值）' : '无快照对比数据'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'raw_before' && (
              <div>
                {formattedBefore ? (
                  <pre style={{
                    margin: 0,
                    padding: '1rem',
                    borderRadius: '6px',
                    background: 'var(--bg-color)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-color)',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    overflowX: 'auto',
                    maxHeight: '400px'
                  }}>
                    {formattedBefore}
                  </pre>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>无变更前快照数据</div>
                )}
              </div>
            )}

            {activeTab === 'raw_after' && (
              <div>
                {formattedAfter ? (
                  <pre style={{
                    margin: 0,
                    padding: '1rem',
                    borderRadius: '6px',
                    background: 'var(--bg-color)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-color)',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    overflowX: 'auto',
                    maxHeight: '400px'
                  }}>
                    {formattedAfter}
                  </pre>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>无变更后快照数据</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
};
