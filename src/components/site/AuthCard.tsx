export function AuthCard({ title, intro, children, footer }: { title: string; intro?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {intro ? <p className="mt-2 text-navy/80">{intro}</p> : null}
      <div className="mt-8 rounded-2xl border border-navy/10 bg-white/70 p-6">{children}</div>
      {footer ? <div className="mt-6 text-sm">{footer}</div> : null}
    </div>
  );
}

export function Notice({ children, tone = "ok" }: { children: React.ReactNode; tone?: "ok" | "warn" }) {
  return (
    <p role="status" className={`mb-4 rounded-lg px-4 py-3 text-sm ${tone === "ok" ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>
      {children}
    </p>
  );
}
