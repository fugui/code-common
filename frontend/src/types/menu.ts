export interface SubMenuItem {
  id?: string;
  path: string;
  label: string;
  headerTitle?: string;
  icon?: string;
  badge?: number | string;
  badgeColor?: string;
  active?: boolean;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  hidden?: boolean;
  requiredRole?: string;
}

export interface MenuGroup {
  groupKey?: string;
  title: string;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  items: SubMenuItem[];
}

export interface ModuleMenuConfig {
  moduleId?: string;
  moduleKey?: string;
  moduleName?: string;
  superAdminOnly?: boolean;
  adminOnly?: boolean;
  groups: MenuGroup[];
}
