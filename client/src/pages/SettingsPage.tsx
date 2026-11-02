import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PanelCard, ListRow } from "@/components/design";
import { useOrganization } from "@/context/OrganizationContext";

const sections = [
  {
    to: "/accounts/settings/account",
    title: "Account",
    caption: "Change your password",
  },
  {
    to: "/accounts/settings/users",
    title: "App users",
    caption: "Add people to this organization",
  },
  {
    to: "/accounts/settings/income-categories",
    title: "Income categories",
    caption: "Labels for money in",
  },
  {
    to: "/accounts/settings/expense-categories",
    title: "Expense categories",
    caption: "Labels and budgets for spend",
  },
  {
    to: "/accounts/settings/organization",
    title: "Organization",
    caption: "Wordmark title (e.g. NTRIO)",
  },
  {
    to: "/accounts/settings/exchange-rate",
    title: "Exchange rate",
    caption: "USD to MVR daily rates",
  },
] as const;

export function SettingsPage() {
  const navigate = useNavigate();
  const { isSystemAdmin } = useOrganization();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-page-title text-ink">Settings</h2>
        <p className="mt-0.5 text-caption">Choose a section</p>
      </div>

      {isSystemAdmin ? (
        <PanelCard title="System admin" bodyClassName="pb-1">
          <ListRow
            primary="Organization setup requests"
            secondary="Dedicated admin area — approve new tenants"
            right={
              <ChevronRight className="h-5 w-5 text-muted-label" strokeWidth={1.8} aria-hidden />
            }
            onClick={() => navigate("/admin")}
            className="border-t-0"
          />
        </PanelCard>
      ) : null}

      <PanelCard title="Sections" bodyClassName="pb-1">
        {sections.map((s, i) => (
          <ListRow
            key={s.to}
            primary={s.title}
            secondary={s.caption}
            right={
              <ChevronRight className="h-5 w-5 text-muted-label" strokeWidth={1.8} aria-hidden />
            }
            onClick={() => navigate(s.to)}
            className={i === 0 ? "border-t-0" : undefined}
          />
        ))}
      </PanelCard>
    </div>
  );
}
