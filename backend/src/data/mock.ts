import type { Booking, ClassSession, DashboardResponse, Member, Payment, TableInfo, User } from '../types.js';

const now = Date.now();
const hour = 60 * 60 * 1000;
const day = 24 * hour;

const users: User[] = [
  { id: 1, name: 'Nguyễn Hoàng Quân', email: 'quanly@pingpongbros.vn', phone: '0905123456', password: '123456', role: 'MANAGER' },
  { id: 2, name: 'Trần Thu Hà', email: 'nhanvien@pingpongbros.vn', phone: '0935222333', password: '123456', role: 'STAFF' },
  { id: 3, name: 'Võ Thị Mai', email: 'giaovien@pingpongbros.vn', phone: '0977888999', password: '123456', role: 'TEACHER' },
  { id: 4, name: 'Đặng Hoàng Nam', email: 'vanglai@gmail.com', phone: '0932111222', password: '123456', role: 'GUEST' },
  { id: 5, name: 'Nguyễn Văn An', email: 'khachthang@gmail.com', phone: '0912345678', password: '123456', role: 'MEMBER', memberId: 1 },
];

const members: Member[] = [
  { id: 1, name: 'Nguyễn Văn An', phone: '0912345678', email: 'khachthang@gmail.com', packageType: 'p1', startDate: new Date(now - 12 * day).toISOString(), endDate: new Date(now + 18 * day).toISOString(), totalTurns: 30, usedTurns: 26, status: 'active' },
  { id: 2, name: 'Trần Thị Bình', phone: '0903456789', email: 'binh.tran@gmail.com', packageType: 'p3', startDate: new Date(now - 40 * day).toISOString(), endDate: new Date(now + 50 * day).toISOString(), totalTurns: 90, usedTurns: 56, status: 'active' },
  { id: 3, name: 'Lê Quốc Cường', phone: '0987654321', email: 'cuong.le@gmail.com', packageType: 'p1', startDate: new Date(now - 20 * day).toISOString(), endDate: new Date(now + 10 * day).toISOString(), totalTurns: 30, usedTurns: 30, status: 'warning' },
  { id: 4, name: 'Phạm Minh Đức', phone: '0356789012', email: 'duc.pham@outlook.com', packageType: 'p6', startDate: new Date(now - 70 * day).toISOString(), endDate: new Date(now + 110 * day).toISOString(), totalTurns: 180, usedTurns: 60, status: 'active' },
  { id: 5, name: 'Hoàng Thu Hà', phone: '0765432109', email: 'thuha@gmail.com', packageType: 'p1', startDate: new Date(now - 25 * day).toISOString(), endDate: new Date(now + 5 * day).toISOString(), totalTurns: 30, usedTurns: 27, status: 'active' },
];

const tables: TableInfo[] = [
  { id: 1, tableNumber: 1, zone: 'teaching', capacity: 4, status: 'busy' },
  { id: 2, tableNumber: 2, zone: 'teaching', capacity: 4, status: 'busy' },
  { id: 3, tableNumber: 3, zone: 'teaching', capacity: 4, status: 'available' },
  { id: 4, tableNumber: 4, zone: 'teaching', capacity: 4, status: 'available' },
  { id: 5, tableNumber: 5, zone: 'customer', capacity: 4, status: 'busy' },
  { id: 6, tableNumber: 6, zone: 'customer', capacity: 4, status: 'busy' },
  { id: 7, tableNumber: 7, zone: 'customer', capacity: 4, status: 'available' },
  { id: 8, tableNumber: 8, zone: 'customer', capacity: 4, status: 'available' },
  { id: 9, tableNumber: 9, zone: 'customer', capacity: 4, status: 'busy' },
  { id: 10, tableNumber: 10, zone: 'customer', capacity: 4, status: 'available' },
  { id: 11, tableNumber: 11, zone: 'customer', capacity: 4, status: 'available' },
  { id: 12, tableNumber: 12, zone: 'customer', capacity: 4, status: 'available' },
  { id: 13, tableNumber: 13, zone: 'customer', capacity: 4, status: 'available' },
  { id: 14, tableNumber: 14, zone: 'customer', capacity: 4, status: 'available' },
  { id: 15, tableNumber: 15, zone: 'customer', capacity: 4, status: 'available' },
  { id: 16, tableNumber: 16, zone: 'customer', capacity: 4, status: 'available' },
];

const bookings: Booking[] = [
  { id: 1, tableId: 5, customerName: 'Đặng Hoàng Nam', phone: '0932111222', email: 'vanglai@gmail.com', type: 'WALK_IN', startTime: new Date(now - 1 * hour).toISOString(), duration: 2, people: 3, status: 'CHECKED_IN', amount: 120000 },
  { id: 2, tableId: 6, customerName: 'Bùi Anh Tuấn', phone: '0944555666', email: 'anh.tuan@gmail.com', type: 'WALK_IN', startTime: new Date(now - 75 * 60 * 1000).toISOString(), duration: 1, people: 2, status: 'CHECKED_IN', amount: 40000 },
  { id: 3, tableId: 9, customerName: 'Phạm Minh Đức', phone: '0356789012', email: 'duc.pham@outlook.com', type: 'MEMBER', startTime: new Date(now - 30 * 60 * 1000).toISOString(), duration: 2, people: 1, status: 'CHECKED_IN', amount: 40000, memberId: 4 },
  { id: 4, tableId: 7, customerName: 'Nguyễn Văn An', phone: '0912345678', email: 'khachthang@gmail.com', type: 'MEMBER', startTime: new Date(now + 20 * 60 * 1000).toISOString(), duration: 2, people: 2, status: 'CONFIRMED', amount: 0, memberId: 1 },
  { id: 5, tableId: 8, customerName: 'Lý Gia Bảo', phone: '0918777666', email: 'giabao@gmail.com', type: 'WALK_IN', startTime: new Date(now + 1 * hour).toISOString(), duration: 1.5, people: 4, status: 'CONFIRMED', amount: 0 },
];

const classes: ClassSession[] = [
  { id: 1, teacherId: 3, teacherName: 'Võ Thị Mai', date: new Date(now).toISOString(), startHour: 9, endHour: 11, tables: [1, 2], status: 'approved' },
  { id: 2, teacherId: 3, teacherName: 'Võ Thị Mai', date: new Date(now + day).toISOString(), startHour: 15, endHour: 17, tables: [3, 4], status: 'pending' },
];

const payments: Payment[] = [
  { id: 1, type: 'tien_choi', amount: 120000, reference: 'Bàn 11 · Nguyễn Văn Hải', who: 'Trần Thu Hà', createdAt: new Date(now - 2 * hour).toISOString() },
  { id: 2, type: 'goi', amount: 449000, reference: 'Gói 1 tháng · Hoàng Thu Hà', who: 'Trần Thu Hà', createdAt: new Date(now - 1 * hour).toISOString() },
  { id: 3, type: 'tien_choi', amount: 80000, reference: 'Bàn 12 · Phan Văn Lộc', who: 'Trần Thu Hà', createdAt: new Date(now - 90 * 60 * 1000).toISOString() },
];

export const dashboardData: DashboardResponse = {
  config: {
    courtPrice: 20000,
    teacherPrice: 250000,
    holdLimitMinutes: 15,
    defaultHours: 2,
    maxPeoplePerTable: 4,
    openingHour: 6,
    closingHour: 21,
    classCutoffHour: 19,
    alertMinutes: 30,
  },
  users,
  members,
  tables,
  bookings,
  classes,
  payments,
  stats: {
    totalRevenue: payments.reduce((sum, item) => sum + item.amount, 0),
    todayBookings: bookings.length,
    activeMembers: members.filter((member) => member.status === 'active').length,
    classesPending: classes.filter((item) => item.status === 'pending').length,
  },
};
