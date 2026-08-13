export interface User {
  id: number;
  employee_id: string;
  name: string;
  department?: {
    id: number;
    name: string;
  } | string;
}
