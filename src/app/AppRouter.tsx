import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/modules/auth/AuthProvider";
import { ProtectedRoute } from "@/app/guards/ProtectedRoute";
import { DashboardLayout } from "@/modules/layout/DashboardLayout";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

// Lazy-loaded page components for route-level code splitting
const LoginPage = lazy(() =>
  import("@/modules/login/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const DashboardPage = lazy(() =>
  import("@/modules/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const MonitorPage = lazy(() =>
  import("@/modules/monitor/MonitorPage").then((m) => ({ default: m.MonitorPage })),
);
const RequestLogsPage = lazy(() =>
  import("@/modules/monitor/RequestLogsPage").then((m) => ({ default: m.RequestLogsPage })),
);
const ProvidersPage = lazy(() =>
  import("@/modules/providers/ProvidersPage").then((m) => ({ default: m.ProvidersPage })),
);
const AuthFilesPage = lazy(() =>
  import("@/modules/auth-files/AuthFilesPage").then((m) => ({ default: m.AuthFilesPage })),
);
const ConfigPage = lazy(() =>
  import("@/modules/config/ConfigPage").then((m) => ({ default: m.ConfigPage })),
);
const LogsPage = lazy(() =>
  import("@/modules/logs/LogsPage").then((m) => ({ default: m.LogsPage })),
);
const SystemPage = lazy(() =>
  import("@/modules/system/SystemPage").then((m) => ({ default: m.SystemPage })),
);
const ApiKeysPage = lazy(() =>
  import("@/modules/api-keys/ApiKeysPage").then((m) => ({ default: m.ApiKeysPage })),
);
const ChannelGroupsPage = lazy(() =>
  import("@/modules/channel-groups/ChannelGroupsPage").then((m) => ({
    default: m.ChannelGroupsPage,
  })),
);
const IdentityFingerprintPage = lazy(() =>
  import("@/modules/identity-fingerprint/IdentityFingerprintPage").then((m) => ({
    default: m.IdentityFingerprintPage,
  })),
);
const ModelsPage = lazy(() =>
  import("@/modules/models/ModelsPage").then((m) => ({ default: m.ModelsPage })),
);
const ApiKeyLookupPage = lazy(() =>
  import("@/modules/apikey-lookup/ApiKeyLookupPage").then((m) => ({ default: m.ApiKeyLookupPage })),
);

export function AppRouter() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="font-sans antialiased">
          <Suspense>
            <Routes>
              {/* Public page – outside AuthProvider to avoid triggering /management/config */}
              <Route path="/apikey-lookup" element={<ApiKeyLookupPage />} />

              {/* Everything else requires AuthProvider for session management */}
              <Route
                path="*"
                element={
                  <AuthProvider>
                    <Suspense>
                      <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route element={<ProtectedRoute />}>
                          <Route element={<DashboardLayout />}>
                            <Route path="/dashboard" element={<DashboardPage />} />
                            <Route path="/monitor" element={<MonitorPage />} />
                            <Route path="/monitor/request-logs" element={<RequestLogsPage />} />
                            <Route path="/ai-providers" element={<ProvidersPage />} />
                            <Route path="/ai-providers/*" element={<ProvidersPage />} />
                            <Route path="/auth-files" element={<AuthFilesPage />} />
                            <Route
                              path="/auth-files/oauth-excluded"
                              element={<Navigate to="/auth-files?tab=excluded" replace />}
                            />
                            <Route
                              path="/auth-files/oauth-model-alias"
                              element={<Navigate to="/auth-files?tab=alias" replace />}
                            />
                            <Route path="/usage" element={<Navigate to="/monitor" replace />} />
                            <Route path="/config" element={<ConfigPage />} />
                            <Route path="/logs" element={<LogsPage />} />
                            <Route path="/system" element={<SystemPage />} />
                            <Route path="/settings" element={<Navigate to="/config" replace />} />
                            <Route path="/api-keys" element={<ApiKeysPage />} />
                            <Route path="/channel-groups" element={<ChannelGroupsPage />} />
                            <Route path="/identity-fingerprint" element={<IdentityFingerprintPage />} />
                            <Route path="/manage/identity-fingerprint" element={<IdentityFingerprintPage />} />
                            <Route path="/models" element={<ModelsPage />} />
                            <Route path="/" element={<Navigate to="/dashboard" replace />} />
                          </Route>
                        </Route>
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                      </Routes>
                    </Suspense>
                  </AuthProvider>
                }
              />
            </Routes>
          </Suspense>
        </div>
      </ToastProvider>
    </ThemeProvider>
  );
}
