import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { AdminPage } from '../features/admin/AdminPage';
import { AssistantPage } from '../features/assistant/AssistantPage';
import { TasksPage } from '../features/tasks/TasksPage';
import { InvitePage } from '../features/invitations/InvitePage';
import { AlertsPage } from '../features/alerts/AlertsPage';
import { AlertDetailPage } from '../features/alerts/AlertDetailPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { DevicesPage } from '../features/devices/DevicesPage';
import { HistoryPage } from '../features/history/HistoryPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { SharePage } from '../features/share/SharePage';
import { StudioViewDataPage } from '../features/studio/StudioViewDataPage';
import { StudioViewDetailPage } from '../features/studio/StudioViewDetailPage';
import { StudioViewsPage } from '../features/studio/StudioViewsPage';
import { SubjectsPage } from '../features/subjects/SubjectsPage';
import { LandingPage } from '../pages/LandingPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { AppShell } from './AppShell';
import { ComingSoonPage } from './ComingSoonPage';
import { ProtectedRoute } from './ProtectedRoute';

/**
 * Sơ đồ route:
 * - Công khai: / (landing), /login, /register, /invite/:token, * (404).
 * - Bảo vệ (/app): tổng quan, lịch sử, cảnh báo (+chi tiết), hồ sơ, chia sẻ,
 *   thiết bị, thông báo. Route chưa có → trang "sẽ có ở wave sau".
 */
export const appRoutes: RouteObject[] = [
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/invite/:token', element: <InvitePage /> },
  {
    path: '/app',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'history', element: <HistoryPage /> },
          { path: 'alerts', element: <AlertsPage /> },
          { path: 'alerts/:id', element: <AlertDetailPage /> },
          { path: 'subjects', element: <SubjectsPage /> },
          { path: 'subjects/:id/share', element: <SharePage /> },
          { path: 'devices', element: <DevicesPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'assistant', element: <AssistantPage /> },
          { path: 'tasks', element: <TasksPage /> },
          { path: 'admin', element: <AdminPage /> },
          { path: 'studio', element: <StudioViewsPage /> },
          { path: 'studio/:id', element: <StudioViewDetailPage /> },
          { path: 'studio/:id/data', element: <StudioViewDataPage /> },
          { path: '*', element: <ComingSoonPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(appRoutes);
