import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { PageLoader } from '../components/PageLoader';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { InvitePage } from '../features/invitations/InvitePage';
import { LandingPage } from '../pages/LandingPage';
import { AppNotFoundPage } from '../pages/AppNotFoundPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { AppShell } from './AppShell';
import { ProtectedRoute } from './ProtectedRoute';

// Các trang sau đăng nhập được tách chunk theo route: lần đầu chỉ tải phần cần dùng.
// Named export được chuyển thành default để React.lazy dùng được.
const AdminPage = lazy(() =>
  import('../features/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
);
const AssistantPage = lazy(() =>
  import('../features/assistant/AssistantPage').then((m) => ({ default: m.AssistantPage })),
);
const TasksPage = lazy(() =>
  import('../features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })),
);
const AlertsPage = lazy(() =>
  import('../features/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage })),
);
const AlertDetailPage = lazy(() =>
  import('../features/alerts/AlertDetailPage').then((m) => ({ default: m.AlertDetailPage })),
);
const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const DevicesPage = lazy(() =>
  import('../features/devices/DevicesPage').then((m) => ({ default: m.DevicesPage })),
);
const HistoryPage = lazy(() =>
  import('../features/history/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const VisitReportPage = lazy(() =>
  import('../features/history/VisitReportPage').then((m) => ({ default: m.VisitReportPage })),
);
const CarePage = lazy(() =>
  import('../features/care/CarePage').then((m) => ({ default: m.CarePage })),
);
const SharePage = lazy(() =>
  import('../features/share/SharePage').then((m) => ({ default: m.SharePage })),
);
const StudioViewDataPage = lazy(() =>
  import('../features/studio/StudioViewDataPage').then((m) => ({ default: m.StudioViewDataPage })),
);
const StudioViewDetailPage = lazy(() =>
  import('../features/studio/StudioViewDetailPage').then((m) => ({ default: m.StudioViewDetailPage })),
);
const StudioViewsPage = lazy(() =>
  import('../features/studio/StudioViewsPage').then((m) => ({ default: m.StudioViewsPage })),
);
const SubjectsPage = lazy(() =>
  import('../features/subjects/SubjectsPage').then((m) => ({ default: m.SubjectsPage })),
);
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

/** Giữ fallback nhất quán khi chunk của route đang tải (mạng chậm/mất mạng). */
function page(element: ReactNode): ReactNode {
  return <Suspense fallback={<PageLoader label="Đang tải trang…" />}>{element}</Suspense>;
}

/**
 * Sơ đồ route:
 * - Công khai: / (landing), /login, /register, /invite/:token, * (404).
 * - Bảo vệ (/app): `/app` mở không gian trợ lý (trung tâm), tổng quan chi tiết
 *   ở `/app/overview`; sau đó là lịch sử (+phiếu đi khám), cảnh báo (+chi tiết),
 *   hồ sơ, nhắc chăm sóc, chia sẻ, thiết bị, trợ lý (giữ đường dẫn cũ), công việc,
 *   cài đặt, Studio, quản trị.
 *   `/app/notifications` chuyển sang `/app/alerts?view=notifications` (inbox thật
 *   của NotificationsPage, không chỉ về danh sách cảnh báo).
 *   Route lạ → 404 trong khung.
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
          { index: true, element: page(<AssistantPage />) },
          { path: 'overview', element: page(<DashboardPage />) },
          { path: 'history', element: page(<HistoryPage />) },
          { path: 'history/report', element: page(<VisitReportPage />) },
          { path: 'care', element: page(<CarePage />) },
          { path: 'alerts', element: page(<AlertsPage />) },
          { path: 'alerts/:id', element: page(<AlertDetailPage />) },
          { path: 'subjects', element: page(<SubjectsPage />) },
          { path: 'subjects/:id/share', element: page(<SharePage />) },
          { path: 'devices', element: page(<DevicesPage />) },
          { path: 'notifications', element: <Navigate to="/app/alerts?view=notifications" replace /> },
          { path: 'assistant', element: page(<AssistantPage />) },
          { path: 'tasks', element: page(<TasksPage />) },
          { path: 'settings', element: page(<SettingsPage />) },
          { path: 'admin', element: page(<AdminPage />) },
          { path: 'studio', element: page(<StudioViewsPage />) },
          { path: 'studio/:id', element: page(<StudioViewDetailPage />) },
          { path: 'studio/:id/data', element: page(<StudioViewDataPage />) },
          { path: '*', element: <AppNotFoundPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(appRoutes);
