import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { hasPublicSupabaseEnv } from "../../lib/env";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function safeNext(nextRaw: string | null | undefined): string {
  const n = String(nextRaw ?? "").trim();
  if (!n) return "/";
  if (!n.startsWith("/")) return "/";
  if (n.startsWith("//")) return "/";
  return n;
}

async function requestSignupCode(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!email) redirect(`/signup?error=missing_email&next=${encodeURIComponent(next)}`);

  if (!hasPublicSupabaseEnv()) {
    redirect(`/signup?error=missing_supabase_env&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();
  const origin = (await headers()).get("origin") ?? "";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);

  redirect(`/signup?sent=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
}

async function completeSignup(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email) redirect(`/signup?error=missing_email&next=${encodeURIComponent(next)}`);
  if (!token) redirect(`/signup?sent=1&email=${encodeURIComponent(email)}&error=missing_code&next=${encodeURIComponent(next)}`);
  if (!password || password.length < 8) {
    redirect(
      `/signup?sent=1&email=${encodeURIComponent(email)}&error=${encodeURIComponent(
        "password_too_short",
      )}&next=${encodeURIComponent(next)}`,
    );
  }

  if (!hasPublicSupabaseEnv()) {
    redirect(`/signup?error=missing_supabase_env&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();

  const { error: vErr } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (vErr) {
    redirect(
      `/signup?sent=1&email=${encodeURIComponent(email)}&error=${encodeURIComponent(
        vErr.message,
      )}&next=${encodeURIComponent(next)}`,
    );
  }

  const { error: pErr } = await supabase.auth.updateUser({ password });
  if (pErr) {
    redirect(
      `/signup?sent=1&email=${encodeURIComponent(email)}&error=${encodeURIComponent(
        pErr.message,
      )}&next=${encodeURIComponent(next)}`,
    );
  }

  redirect(next);
}

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<{ sent?: string; error?: string; email?: string; next?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const configured = hasPublicSupabaseEnv();
  const sent = sp.sent === "1";
  const error = sp.error;
  const email = String(sp.email ?? "").trim();
  const next = safeNext(sp.next);

  const showPasswordTooShort = error === "password_too_short";
  const displayError =
    error && showPasswordTooShort ? "Password must be at least 8 characters." : error;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto w-full max-w-xl">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
          <Link className="text-sm font-medium underline hover:no-underline" href="/login">
            Sign in
          </Link>
        </header>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          We’ll email you a one-time code to verify you own the email. Then you’ll set a password
          for future logins.
        </p>

        {!configured && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-medium">Supabase is not configured yet.</p>
            <p className="mt-1">
              Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>web/.env.local</code>.
            </p>
          </div>
        )}

        {displayError ? (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {displayError}
          </div>
        ) : null}

        {!sent ? (
          <form
            action={requestSignupCode}
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
            <button
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              disabled={!configured}
              type="submit"
            >
              Email me a code
            </button>
          </form>
        ) : (
          <div className="mt-8">
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              Enter the code we emailed you, then choose a password.
            </p>
            <form
              action={completeSignup}
              className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <input type="hidden" name="next" value={next} />
              <label className="text-sm font-medium" htmlFor="email_verify">
                Email
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                id="email_verify"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={email}
                required
              />

              <label className="mt-5 block text-sm font-medium" htmlFor="token">
                One-time code
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                id="token"
                name="token"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                required
              />

              <label className="mt-5 block text-sm font-medium" htmlFor="password">
                Password
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
              />

              <button
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                type="submit"
              >
                Verify and set password
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
              <Link className="underline hover:no-underline" href={`/signup?next=${encodeURIComponent(next)}`}>
                Use a different email
              </Link>
              <form action={requestSignupCode}>
                <input type="hidden" name="next" value={next} />
                <input type="hidden" name="email" value={email} />
                <button className="underline hover:no-underline" type="submit">
                  Resend code
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

