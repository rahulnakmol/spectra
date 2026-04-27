import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryProvider } from './query/QueryProvider';
import { AuthProvider } from './auth/AuthContext';
import { ThemeProvider } from './theme/ThemeProvider';
import { RequireAuth } from './auth/RequireAuth';
import { RequireAdmin } from './auth/RequireAdmin';
import { AppShell } from './shell/AppShell';
import { LoginPage } from './pages/LoginPage';
import { WorkspacePickerPage } from './pages/WorkspacePickerPage';
import { WorkspaceLandingPage } from './pages/WorkspaceLandingPage';
import { BrowsePage } from './pages/BrowsePage';
import { UploadPage } from './pages/UploadPage';
import { MyUploadsPage } from './pages/MyUploadsPage';
import { AdminPage } from './pages/AdminPage';

export function App(): JSX.Element {
  return (
    <QueryProvider>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth><AppShell /></RequireAuth>}>
                <Route index element={<Navigate to="/w" replace />} />
                <Route path="/w" element={<WorkspacePickerPage />} />
                <Route path="/w/:ws" element={<WorkspaceLandingPage />} />
                <Route path="/w/:ws/browse" element={<BrowsePage />} />
                <Route path="/w/:ws/upload" element={<UploadPage />} />
                <Route path="/w/:ws/my" element={<MyUploadsPage />} />
                <Route
                  path="/w/:ws/admin/*"
                  element={<RequireAdmin><AdminPage /></RequireAdmin>}
                />
              </Route>
              <Route path="*" element={<Navigate to="/w" replace />} />
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
