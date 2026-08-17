export interface SubMenuItem {
  id: string;
  label: string;
  icon?: string;
  badge?: number | string;
  badgeColor?: string;
  path?: string;
  active?: boolean;
  requiredRole?: string;
}

export interface MenuGroup {
  title: string;
  items: SubMenuItem[];
}

export interface ModuleMenuConfig {
  moduleId: string;
  groups: MenuGroup[];
}
