import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { DisplayCurrencyProvider } from "./context/DisplayCurrencyContext";
import { OrganizationProvider, useOrganization } from "./context/OrganizationContext";
import { WorkspaceLayout } from "./components/WorkspaceLayout";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { SelectOrganizationPage } from "./pages/SelectOrganizationPage";
import { PendingApprovalPage } from "./pages/PendingApprovalPage";
import { AdminOrgRequestsPage } from "./pages/AdminOrgRequestsPage";
import { HubPage } from "./pages/HubPage";
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
import { SettingsAccountPage } from "./pages/settings/SettingsAccountPage";
import { SettingsUsersPage } from "./pages/settings/SettingsUsersPage";
import { SettingsIncomeCategoriesPage } from "./pages/settings/SettingsIncomeCategoriesPage";
import { SettingsExpenseCategoriesPage } from "./pages/settings/SettingsExpenseCategoriesPage";
import { SettingsOrganizationPage } from "./pages/settings/SettingsOrganizationPage";
import { SettingsExchangeRatePage } from "./pages/settings/SettingsExchangeRatePage";
import { CashMovementPage } from "./pages/CashMovementPage";
import { KitchenOrdersPage } from "./pages/kitchen/KitchenOrdersPage";
import { KitchenSummariesPage } from "./pages/kitchen/KitchenSummariesPage";
import { KitchenRecipesPage } from "./pages/kitchen/KitchenRecipesPage";
import { OccupancyCalendarPage } from "./pages/occupancy/OccupancyCalendarPage";
import { OccupancyRoomsPage } from "./pages/occupancy/OccupancyRoomsPage";
import { StockInventoryPage } from "./pages/stock/StockInventoryPage";
import { StockShoppingPage } from "./pages/stock/StockShoppingPage";
import { StockReportsPage } from "./pages/stock/StockReportsPage";

const GATE_ALLOW = new Set(["/pending-approval", "/admin", "/select-organization"]);

function OrgGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { ready, needsSelection, needsApproval, isSystemAdmin } = useOrganization();

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-ground text-muted-label">
        Loading…
      </div>
    );
  }

  if (needsApproval && !GATE_ALLOW.has(location.pathname)) {
    // System admin with no org is bootstrapped server-side; if still empty, allow /admin
    if (isSystemAdmin && location.pathname.startsWith("/admin")) {
      return children;
    }
    return <Navigate to="/pending-approval" replace />;
  }

  if (needsSelection && location.pathname !== "/select-organization") {
    return <Navigate to="/select-organization" replace />;
  }

  return children;
}

function Protected() {
  const session = useAuthStore((s) => s.session);
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return (
    <OrganizationProvider>
      <DisplayCurrencyProvider>
        <OrgGate>
          <Outlet />
        </OrgGate>
      </DisplayCurrencyProvider>
    </OrganizationProvider>
  );
}

function AccountsShell() {
  return (
    <WorkspaceLayout workspace="accounts">
      <Outlet />
    </WorkspaceLayout>
  );
}

function KitchenShell() {
  return (
    <WorkspaceLayout workspace="kitchen">
      <Outlet />
    </WorkspaceLayout>
  );
}

function StockShell() {
  return (
    <WorkspaceLayout workspace="stock">
      <Outlet />
    </WorkspaceLayout>
  );
}

function OccupancyShell() {
  return (
    <WorkspaceLayout workspace="occupancy">
      <Outlet />
    </WorkspaceLayout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<Protected />}>
        <Route path="/select-organization" element={<SelectOrganizationPage />} />
        <Route path="/pending-approval" element={<PendingApprovalPage />} />
        <Route path="/admin" element={<AdminOrgRequestsPage />} />
        <Route path="/" element={<HubPage />} />

        <Route path="/accounts" element={<AccountsShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="ledger" element={<AccountsPage />} />
          <Route path="ledger/:id" element={<AccountStatementPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="contacts/:id" element={<ContactDetailPage />} />
          <Route path="income" element={<IncomePage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="debts" element={<DebtsPage />} />
          <Route path="reports" element={<ReportsPage />}>
            <Route index element={<Navigate to="pnl" replace />} />
            <Route path="pnl" element={<ReportsPnlTab />} />
            <Route path="categories/:categoryId" element={<ReportsCategoryDetailPage />} />
            <Route path="cashflow" element={<ReportsCashflowTab />} />
            <Route path="balance-sheet" element={<ReportsBalanceSheetTab />} />
          </Route>
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/account" element={<SettingsAccountPage />} />
          <Route path="settings/users" element={<SettingsUsersPage />} />
          <Route path="settings/income-categories" element={<SettingsIncomeCategoriesPage />} />
          <Route path="settings/expense-categories" element={<SettingsExpenseCategoriesPage />} />
          <Route path="settings/organization" element={<SettingsOrganizationPage />} />
          <Route path="settings/exchange-rate" element={<SettingsExchangeRatePage />} />
          <Route path="cash-movement" element={<CashMovementPage />} />
          <Route path=":id" element={<LegacyAccountRedirect />} />
        </Route>

        <Route path="/kitchen" element={<KitchenShell />}>
          <Route index element={<KitchenOrdersPage />} />
          <Route path="summaries" element={<KitchenSummariesPage />} />
          <Route path="recipes" element={<KitchenRecipesPage />} />
          <Route path="rooms" element={<Navigate to="/occupancy/rooms" replace />} />
        </Route>

        <Route path="/occupancy" element={<OccupancyShell />}>
          <Route index element={<OccupancyCalendarPage />} />
          <Route path="rooms" element={<OccupancyRoomsPage />} />
        </Route>

        <Route path="/stock" element={<StockShell />}>
          <Route index element={<StockInventoryPage />} />
          <Route path="shopping" element={<StockShoppingPage />} />
          <Route path="reports" element={<StockReportsPage />} />
        </Route>

        <Route path="/contacts" element={<Navigate to="/accounts/contacts" replace />} />
        <Route path="/contacts/:id" element={<LegacyContactRedirect />} />
        <Route path="/income" element={<Navigate to="/accounts/income" replace />} />
        <Route path="/expenses" element={<Navigate to="/accounts/expenses" replace />} />
        <Route path="/debts" element={<Navigate to="/accounts/debts" replace />} />
        <Route path="/reports/*" element={<Navigate to="/accounts/reports" replace />} />
        <Route path="/settings" element={<Navigate to="/accounts/settings" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function LegacyContactRedirect() {
  const { id } = useParams();
  return <Navigate to={`/accounts/contacts/${id ?? ""}`} replace />;
}

function LegacyAccountRedirect() {
  const { id } = useParams();
  return <Navigate to={`/accounts/ledger/${id ?? ""}`} replace />;
}
