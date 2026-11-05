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
  status?: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN';
}): Promise<void> {
  await api.post('/bookings', input);
}

export async function checkInBooking(bookingId: number): Promise<void> {
  await api.post(`/bookings/${bookingId}/checkin`);
}

export async function checkOutBooking(bookingId: number): Promise<{ amount: number; message: string }> {
  const { data } = await api.post<{ amount: number; message: string }>(`/bookings/${bookingId}/checkout`);
  return data;
}

export async function approveClass(classId: number): Promise<void> {
  await api.post(`/classes/${classId}/approve`);
}

export async function rejectClass(classId: number): Promise<void> {
  await api.post(`/classes/${classId}/reject`);
}

export async function renewMember(memberId: number, packageId: string): Promise<void> {
  await api.post(`/members/${memberId}/renew`, { packageId });
}

export async function createWaitlist(input: {
  customerName: string;
  phone: string;
  email?: string;
  people: number;
  startTime: string;
  duration: number;
  type: 'WALK_IN' | 'MEMBER' | 'TEACHER';
}): Promise<void> {
  await api.post('/waitlist', input);
}

export async function updateConfig(config: Partial<DashboardResponse['config']>): Promise<void> {
  await api.post('/config', config);
}
