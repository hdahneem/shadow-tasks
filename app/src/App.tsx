import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { AppShell } from './components/AppShell';
import { ToastContainer } from './components/ToastContainer';
import { SyncManager } from './components/SyncManager';

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const FolderView = lazy(() => import('./pages/FolderView').then((m) => ({ default: m.FolderView })));
const ProjectView = lazy(() => import('./pages/ProjectView').then((m) => ({ default: m.ProjectView })));
const AllQuestsView = lazy(() => import('./pages/AllQuestsView').then((m) => ({ default: m.AllQuestsView })));
const CalendarView = lazy(() => import('./pages/CalendarView').then((m) => ({ default: m.CalendarView })));
const SearchView = lazy(() => import('./pages/SearchView').then((m) => ({ default: m.SearchView })));
const ArchivedQuestsView = lazy(() =>
  import('./pages/ArchivedQuestsView').then((m) => ({ default: m.ArchivedQuestsView }))
);
const DocsListView = lazy(() => import('./pages/DocsListView').then((m) => ({ default: m.DocsListView })));
const DocEditor = lazy(() => import('./pages/DocEditor').then((m) => ({ default: m.DocEditor })));
const TaskDetail = lazy(() => import('./pages/TaskDetail').then((m) => ({ default: m.TaskDetail })));
const KanbanBoard = lazy(() => import('./pages/KanbanBoard').then((m) => ({ default: m.KanbanBoard })));
const TableView = lazy(() => import('./pages/TableView').then((m) => ({ default: m.TableView })));
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Register').then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() =>
  import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword }))
);
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const PublicTaskView = lazy(() => import('./pages/PublicTaskView').then((m) => ({ default: m.PublicTaskView })));
const ActivityFeedView = lazy(() =>
  import('./pages/ActivityFeedView').then((m) => ({ default: m.ActivityFeedView }))
);
const WorkloadView = lazy(() => import('./pages/WorkloadView').then((m) => ({ default: m.WorkloadView })));
const BadgesView = lazy(() => import('./pages/BadgesView').then((m) => ({ default: m.BadgesView })));
const TimelineView = lazy(() => import('./pages/TimelineView').then((m) => ({ default: m.TimelineView })));
const TodayView = lazy(() => import('./pages/TodayView').then((m) => ({ default: m.TodayView })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <span className="font-body text-xs tracking-widest uppercase text-mist-dim animate-pulse">
        Loading…
      </span>
    </div>
  );
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <>
      <ToastContainer />
      <SyncManager />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/share/:token" element={<PublicTaskView />} />
          <Route
            path="/login"
            element={
              <GuestOnly>
                <Login />
              </GuestOnly>
            }
          />
          <Route
            path="/register"
            element={
              <GuestOnly>
                <Register />
              </GuestOnly>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <GuestOnly>
                <ForgotPassword />
              </GuestOnly>
            }
          />
          <Route
            path="/reset-password"
            element={
              <GuestOnly>
                <ResetPassword />
              </GuestOnly>
            }
          />

          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/today" element={<TodayView />} />
            <Route path="/all" element={<AllQuestsView />} />
            <Route path="/calendar" element={<CalendarView />} />
            <Route path="/search" element={<SearchView />} />
            <Route path="/archived" element={<ArchivedQuestsView />} />
            <Route path="/docs" element={<DocsListView />} />
            <Route path="/docs/:docId" element={<DocEditor />} />
            <Route path="/activity" element={<ActivityFeedView />} />
            <Route path="/workload" element={<WorkloadView />} />
            <Route path="/badges" element={<BadgesView />} />
            <Route path="/folders/:folderId" element={<FolderView />} />
            <Route path="/projects/:projectId" element={<ProjectView />} />
            <Route path="/projects/:projectId/board" element={<KanbanBoard />} />
            <Route path="/projects/:projectId/table" element={<TableView />} />
            <Route path="/projects/:projectId/timeline" element={<TimelineView />} />
            <Route path="/tasks/:taskId" element={<TaskDetail />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;
