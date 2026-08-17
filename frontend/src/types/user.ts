export interface User {
  id: number;
  employee_id: string;
  name: string;
  email?: string;
  username?: string;
  is_admin?: boolean;
  is_active?: boolean;
  roles?: string[] | string;
  department_id?: number | null;
  department?: {
    id?: number;
    name: string;
  } | string | null;
}
