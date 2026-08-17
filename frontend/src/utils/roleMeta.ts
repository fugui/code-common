export interface RoleInfo {
  key: string;
  nameCn: string;
  shortName: string;
  badgeBg: string;
  badgeColor: string;
  level: number;
}

export const ROLE_REGISTRY: Record<string, RoleInfo> = {
  super_admin: {
    key: 'super_admin',
    nameCn: '超级管理员',
    shortName: '超管',
    badgeBg: 'rgba(239, 68, 68, 0.15)',
    badgeColor: '#ef4444',
    level: 100,
  },
  shield_admin: {
    key: 'shield_admin',
    nameCn: '安全扫描管理员',
    shortName: '盾管',
    badgeBg: 'rgba(59, 130, 246, 0.15)',
    badgeColor: '#3b82f6',
    level: 50,
  },
  bench_admin: {
    key: 'bench_admin',
    nameCn: '平台运维管理员',
    shortName: '台管',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    badgeColor: '#10b981',
    level: 50,
  },
  pipeline_admin: {
    key: 'pipeline_admin',
    nameCn: '流水线管理员',
    shortName: '线管',
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    badgeColor: '#f59e0b',
    level: 50,
  },
  pdm_admin: {
    key: 'pdm_admin',
    nameCn: 'PDM管理员',
    shortName: 'PDM',
    badgeBg: 'rgba(139, 92, 246, 0.15)',
    badgeColor: '#8b5cf6',
    level: 50,
  },
};

export function getRoleDisplayName(role: string): string {
  return ROLE_REGISTRY[role]?.nameCn || role;
}

export function getRoleShortName(role: string): string {
  return ROLE_REGISTRY[role]?.shortName || role;
}

export function getRoleBadgeStyle(role: string): { background: string; color: string } {
  const info = ROLE_REGISTRY[role];
  if (info) {
    return { background: info.badgeBg, color: info.badgeColor };
  }
  return { background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' };
}
