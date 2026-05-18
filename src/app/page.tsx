import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-slate-100">
      <section className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Prowider Mini Lead Distribution
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-300">
          Lead capture, fair provider allocation, quota enforcement, idempotent webhooks, and
          real-time dashboards.
        </p>

        <nav className="mt-10 grid gap-3 sm:grid-cols-2">
          <Link
            href="/request-service"
            className="rounded-lg border border-blue-400/40 bg-blue-500/10 px-5 py-4 text-blue-100 hover:bg-blue-500/20"
          >
            <span className="font-semibold">Request service</span>
            <span className="mt-1 block text-sm text-blue-200/80">
              Customer enquiry form
            </span>
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-5 py-4 text-emerald-100 hover:bg-emerald-500/20"
          >
            <span className="font-semibold">Provider dashboard</span>
            <span className="mt-1 block text-sm text-emerald-200/80">
              Live quota &amp; assigned leads
            </span>
          </Link>
          <Link
            href="/test-tools"
            className="rounded-lg border border-purple-400/40 bg-purple-500/10 px-5 py-4 text-purple-100 hover:bg-purple-500/20 sm:col-span-2"
          >
            <span className="font-semibold">Test tools</span>
            <span className="mt-1 block text-sm text-purple-200/80">
              Webhook idempotency, quota reset, concurrent leads
            </span>
          </Link>
        </nav>
      </section>
    </main>
  );
}
