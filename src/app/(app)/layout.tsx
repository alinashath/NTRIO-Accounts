import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { BusinessProvider } from "@/components/business-provider";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BusinessProvider>
      <AppHeader />
      <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-2">
        {children}
      </main>
      <BottomNav />
    </BusinessProvider>
  );
}
