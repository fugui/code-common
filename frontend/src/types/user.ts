export interface User {
  id: number;
  employee_id: string;
  name: string;
  email?: string;
  username?: string;
  roles?: string[];
  department?: {
    id: number;
    name: string;
  } | string;
}
