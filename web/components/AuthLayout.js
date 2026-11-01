import Link from 'next/link';

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm animate-fade-in">
          <Link href="/" className="mb-10 flex items-center gap-2">
            <img src="/logo.svg" alt="" className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight">FeatureTrack</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-subtle">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-subtle">{footer}</div>}
        </div>
      </div>
      <div className="relative hidden flex-1 overflow-hidden border-l border-line bg-panel lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(42,120,214,.16),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-center px-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Product analytics for builders</p>
          <h2 className="mt-3 max-w-md text-3xl font-semibold leading-tight tracking-tight">Know which features your users actually adopt.</h2>
          <ul className="mt-8 space-y-3 text-sm text-muted">
            {['Track events from any app with one API key', 'Funnels, retention and feature adoption from real data', 'Live event stream, webhooks and audit logs', 'Role-based access for your whole team'].map((t) => (
              <li key={t} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-brand-500" />{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
