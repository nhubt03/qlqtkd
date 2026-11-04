import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { dashboardData } from './data/mock.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'PingPongBros API', timestamp: new Date().toISOString() });
});

app.get('/api/dashboard', (_req, res) => {
  res.json(dashboardData);
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};

  const user = dashboardData.users.find((item) => item.email.toLowerCase() === String(email || '').toLowerCase() && item.password === String(password || ''));

  if (!user) {
    return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu.' });
  }

  const { password: _password, ...safeUser } = user;
  return res.json({ user: safeUser, token: 'demo-token' });
});

app.get('/api/tables', (_req, res) => {
  res.json(dashboardData.tables);
});

app.get('/api/members', (_req, res) => {
  res.json(dashboardData.members);
});

app.get('/api/bookings', (_req, res) => {
  res.json(dashboardData.bookings);
});

app.get('/api/classes', (_req, res) => {
  res.json(dashboardData.classes);
});

app.get('/api/payments', (_req, res) => {
  res.json(dashboardData.payments);
});

app.post('/api/bookings', (req, res) => {
  const body = req.body ?? {};
  const booking = {
    id: dashboardData.bookings.length + 1,
    tableId: Number(body.tableId),
    customerName: String(body.customerName ?? ''),
    phone: String(body.phone ?? ''),
    email: String(body.email ?? ''),
    type: (body.type ?? 'WALK_IN') as 'WALK_IN' | 'MEMBER' | 'TEACHER',
    startTime: new Date(body.startTime ?? Date.now()).toISOString(),
    duration: Number(body.duration ?? 2),
    people: Number(body.people ?? 2),
    status: 'CONFIRMED' as const,
    amount: Number(body.amount ?? 0),
    memberId: body.memberId ?? null,
  };

  dashboardData.bookings.push(booking);
  res.status(201).json(booking);
});

export default app;
