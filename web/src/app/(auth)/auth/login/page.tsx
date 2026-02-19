import Link from "next/link";
import { redirect } from "next/navigation";

import { hasPublicSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNext(nextRaw: string | null | undefined): string {
  const n = String(nextRaw ?? "").trim();
  if (!n) return "/";
  // Only allow internal paths.
  if (!n.startsWith("/")) return "/";
  if (n.startsWith("//")) return "/";
  return n;
}

async function signInWithPassword(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!email) {
    redirect(`/auth/login?error=missing_email&next=${encodeURIComponent(next)}`);
  }
  if (!password) {
    redirect(`/auth/login?error=missing_password&next=${encodeURIComponent(next)}`);
  }

  const configured = hasPublicSupabaseEnv();
  if (!configured) {
    redirect(`/auth/login?error=missing_supabase_env&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(
      `/auth/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`,
    );
  }

  redirect(next);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; next?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const configured = hasPublicSupabaseEnv();
  const error = sp.error;
  const next = safeNext(sp.next);

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto w-full max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Use your email and password. If you don’t have an account yet, create one.
        </p>

        {!configured && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-medium">Supabase is not configured yet.</p>
            <p className="mt-1">
              Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
              <code>web/.env.local</code>.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            Sign-in failed: <span className="font-medium">{error}</span>
          </div>
        )}

        <form
          action={signInWithPassword}
          className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <input type="hidden" name="next" value={next} />

          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="email"
            name="email"
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
            required
            disabled={!configured}
          />

          <label className="mt-5 block text-sm font-medium" htmlFor="password">
            Password
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={!configured}
          />

          <button
            className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            disabled={!configured}
            type="submit"
          >
            Sign in
          </button>

          <div className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
            New here?{" "}
            <Link
              className="font-medium underline hover:no-underline"
              href={`/auth/signup?next=${encodeURIComponent(next)}`}
            >
              Create an account
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

