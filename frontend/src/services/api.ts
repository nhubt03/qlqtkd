import axios from 'axios';
import type { DashboardResponse, User } from '../types';

const api = axios.create({
  baseURL: 'http://localhost:4000/api',
  timeout: 8000,
});

export async function fetchDashboard(): Promise<DashboardResponse> {
  const { data } = await api.get<DashboardResponse>('/dashboard');
  return data;
}

export async function login(email: string, password: string): Promise<{ user: User; token: string }> {
  const { data } = await api.post<{ user: User; token: string }>('/auth/login', { email, password });
  return data;
}

export async function createBooking(input: {
  tableId: number;
  customerName: string;
  phone: string;
  email: string;
  type: 'WALK_IN' | 'MEMBER' | 'TEACHER';
  startTime: string;
  duration: number;
  people: number;
  amount: number;
  memberId: number | null;
}): Promise<void> {
  await api.post('/bookings', input);
}
