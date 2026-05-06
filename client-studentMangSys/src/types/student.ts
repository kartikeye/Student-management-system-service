export interface Student {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  age?: number | null;
  grade?: string | null;
  enrollmentDate?: string | null;
  phone?: string | null;
  address?: string | null;
}

export type StudentFormData = Omit<Student, 'id'>;
