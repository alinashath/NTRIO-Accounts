import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { DisplayCurrencyProvider } from "./context/DisplayCurrencyContext";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AccountsPage } from "./pages/AccountsPage";
import { AccountStatementPage } from "./pages/AccountStatementPage";
import { ContactDetailPage } from "./pages/ContactDetailPage";
import { ContactsPage } from "./pages/ContactsPage";
import { IncomePage } from "./pages/IncomePage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { DebtsPage } from "./pages/DebtsPage";
import ReportsPage from "./pages/ReportsPage";
import { ReportsCategoryDetailPage } from "./pages/reports/ReportsCategoryDetailPage";
import { ReportsPnlTab } from "./pages/reports/ReportsPnlTab";
import { ReportsCashflowTab } from "./pages/reports/ReportsCashflowTab";
import { ReportsBalanceSheetTab } from "./pages/reports/ReportsBalanceSheetTab";
import { SettingsPage } from "./pages/SettingsPage";

function Protected() {
  const session = useAuthStore((s) => s.session);
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return (
    <DisplayCurrencyProvider>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </DisplayCurrencyProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/accounts/:id" element={<AccountStatementPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/contacts/:id" element={<ContactDetailPage />} />
        <Route path="/income" element={<IncomePage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/debts" element={<DebtsPage />} />
        <Route path="/reports" element={<ReportsPage />}>
          <Route index element={<Navigate to="pnl" replace />} />
          <Route path="pnl" element={<ReportsPnlTab />} />
          <Route path="categories/:categoryId" element={<ReportsCategoryDetailPage />} />
          <Route path="cashflow" element={<ReportsCashflowTab />} />
          <Route path="balance-sheet" element={<ReportsBalanceSheetTab />} />
        </Route>
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
