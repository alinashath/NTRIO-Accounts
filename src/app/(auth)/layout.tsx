export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-8">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
          NTRIO Accounts
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Small business books
        </h1>
      </div>
      {children}
    </main>
  );
}
