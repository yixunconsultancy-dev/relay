import { Route, Routes, useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

import { Sidebar } from "@/components/layout/sidebar";
import { HomeRoute } from "@/routes/home";
import { ContactsRoute } from "@/routes/contacts";
import { ContactDetailRoute } from "@/routes/contact-detail";
import { RemindersRoute } from "@/routes/reminders";
import { DailyFocusRoute } from "@/routes/daily-focus";
import { DocumentsRoute } from "@/routes/documents";
import { SettingsRoute } from "@/routes/settings";
import { TouchpointDetailRoute } from "@/routes/touchpoint-detail";
import { ActivityRoute } from "@/routes/activity";
import { DebtRoute } from "@/routes/debt";
import { useEventPoller } from "@/lib/polling";
import { useSyncStatus } from "@/lib/sync-status";
import { ErrorBoundary } from "@/components/error-boundary";

export default function App() {
  // Starts the events polling loop at app boot. Disposed when App unmounts.
  useEventPoller();
  const sync = useSyncStatus();
  const location = useLocation();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base text-fg">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {sync.state === "paused" && (
          <div
            role="alert"
            title={sync.lastError ?? undefined}
            className="flex items-center gap-2 border-b border-status-error/30 bg-status-error/[0.08] px-5 py-2 text-xs text-status-error"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Sync paused after {sync.consecutiveFailures} failed polls
              {sync.lastError ? `: ${sync.lastError}` : "."}
            </span>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <ErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/contacts" element={<ContactsRoute />} />
              <Route path="/contacts/:contactId" element={<ContactDetailRoute />} />
              <Route path="/reminders" element={<RemindersRoute />} />
              <Route path="/daily-focus" element={<DailyFocusRoute />} />
              <Route path="/documents" element={<DocumentsRoute />} />
              <Route
                path="/touchpoints/:touchpointId"
                element={<TouchpointDetailRoute />}
              />
              <Route path="/activity" element={<ActivityRoute />} />
              <Route path="/debt" element={<DebtRoute />} />
              <Route path="/settings" element={<SettingsRoute />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
