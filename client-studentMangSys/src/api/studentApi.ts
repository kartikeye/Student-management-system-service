import axios from 'axios';
import type { Student, StudentFormData } from '../types/student';
import { getAccessToken } from '../auth/tokenStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
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
