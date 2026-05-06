import axios from 'axios';
import type { Student, StudentFormData } from '../types/student';

const api = axios.create({
  baseURL: 'http://localhost:3000',
});

export const getStudents = async (): Promise<Student[]> => {
  const { data } = await api.get('/students');
  return data;
};

export const createStudent = async (payload: StudentFormData): Promise<Student> => {
  const { data } = await api.post('/students', payload);
  return data;
};

export const updateStudent = async (id: number, payload: Partial<StudentFormData>): Promise<Student> => {
  const { data } = await api.put(`/students/${id}`, payload);
  return data;
};

export const deleteStudent = async (id: number): Promise<void> => {
  await api.delete(`/students/${id}`);
};
