export type AuditLevel = 'P0' | 'P1' | 'P2';

export interface FieldDiff {
  field: string;
  old_val: unknown;
  new_val: unknown;
  action: 'added' | 'modified' | 'removed';
}

export interface SysAuditLog {
  id: number;
  created_at: string;
  trace_id: string;

  // 1. Who
  user_id: number;
  username: string;
  user_role: string;
  department_id?: number;
  department_name?: string;

  // 2. Where & Context
  service: string;
  client_ip: string;
  user_agent: string;
  request_path: string;
  request_method: string;

  // 3. What
  module: string;
  action: string;
  level: AuditLevel;
  summary: string;

  // 4. Which
  target_type?: string;
  target_id?: string;
  target_name?: string;

  // 5. Diff & Snapshots
  before_data?: string;
  after_data?: string;
  diff_summary?: string;

  // 6. Result
  status_code: number;
  duration_ms: number;
  error_message?: string;
}

export interface AuditStats {
  total_logs: number;
  today_logs: number;
  p0_count: number;
  p1_count: number;
  p2_count: number;
  service_distribution?: Record<string, number>;
}

export interface AuditQueryParams {
  page?: number;
  pageSize?: number;
  service?: string;
  module?: string;
  level?: string;
  action?: string;
  search?: string;
  start_time?: string;
  end_time?: string;
  status_code?: number | string;
}
