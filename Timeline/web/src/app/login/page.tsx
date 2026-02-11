import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { hasPublicSupabaseEnv } from "../../lib/env";
import { createSupabaseServerClient } from "../../lib/supabase/server";

async function signInWithMagicLink(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect("/login?error=missing_email");
  }

  const configured = hasPublicSupabaseEnv();
  if (!configured) {
    redirect("/login?error=missing_supabase_env");
  }

  const supabase = await createSupabaseServerClient();
  const origin = (await headers()).get("origin") ?? "";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?sent=1");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const configured = hasPublicSupabaseEnv();
  const sent = sp.sent === "1";
  const error = sp.error;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto w-full max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          For MVP we’ll use Supabase Auth. This page will become the email
          login/magic-link flow.
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

        {sent && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
            Check your email for the magic link.
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            Sign-in failed: <span className="font-medium">{error}</span>
          </div>
        )}

        <form
          action={signInWithMagicLink}
          className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
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
          <button
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            disabled={!configured}
            type="submit"
          >
            Send magic link
          </button>
        </form>
      </main>
    </div>
  );
}

