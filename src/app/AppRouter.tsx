import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/modules/auth/AuthProvider";
import { ProtectedRoute } from "@/app/guards/ProtectedRoute";
import { DashboardLayout } from "@/modules/layout/DashboardLayout";
import { LoginPage } from "@/modules/login/LoginPage";
import { MonitorPage } from "@/modules/monitor/MonitorPage";
import { RequestLogsPage } from "@/modules/monitor/RequestLogsPage";
import { ProvidersPage } from "@/modules/providers/ProvidersPage";
import { AuthFilesPage } from "@/modules/auth-files/AuthFilesPage";
import { OAuthPage } from "@/modules/oauth/OAuthPage";
import { QuotaPage } from "@/modules/quota/QuotaPage";
import { ConfigPage } from "@/modules/config/ConfigPage";
import { LogsPage } from "@/modules/logs/LogsPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

export function AppRouter() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <div className="font-sans antialiased">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/monitor" element={<MonitorPage />} />
                  <Route path="/monitor/request-logs" element={<RequestLogsPage />} />
                  <Route path="/ai-providers" element={<ProvidersPage />} />
                  <Route path="/auth-files" element={<AuthFilesPage />} />
                  <Route
                    path="/auth-files/oauth-excluded"
                    element={<Navigate to="/auth-files?tab=excluded" replace />}
                  />
                  <Route
                    path="/auth-files/oauth-model-alias"
                    element={<Navigate to="/auth-files?tab=alias" replace />}
                  />
                  <Route path="/oauth" element={<OAuthPage />} />
                  <Route path="/quota" element={<QuotaPage />} />
                  <Route path="/config" element={<ConfigPage />} />
                  <Route path="/logs" element={<LogsPage />} />
                  <Route path="/" element={<Navigate to="/monitor" replace />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/monitor" replace />} />
            </Routes>
          </div>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
