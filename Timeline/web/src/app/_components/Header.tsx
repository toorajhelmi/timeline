import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../../lib/supabase/server";
import { hasPublicSupabaseEnv } from "../../lib/env";

async function signOut() {
  "use server";

  if (!hasPublicSupabaseEnv()) {
    redirect("/");
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function Header() {
  const configured = hasPublicSupabaseEnv();

  let userEmail: string | null = null;
  let isAdmin = false;
  if (configured) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    userEmail = data.user?.email ?? null;
    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", data.user.id)
        .maybeSingle();
      isAdmin = Boolean(profile?.is_admin);
    }
  }

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Link className="text-sm font-semibold tracking-tight" href="/">
            Timeline
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400 sm:flex">
            <Link className="hover:text-zinc-950 dark:hover:text-white" href="/">
              Explore
            </Link>
            <Link
              className="hover:text-zinc-950 dark:hover:text-white"
              href="/new"
            >
              New timeline
            </Link>
            {isAdmin && (
              <>
                <Link
                  className="hover:text-zinc-950 dark:hover:text-white"
                  href="/admin/timelines"
                >
                  Admin
                </Link>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {userEmail ? (
            <>
              <span className="hidden max-w-[220px] truncate text-zinc-600 dark:text-zinc-400 sm:inline">
                {userEmail}
              </span>
              <form action={signOut}>
                <button className="rounded-full border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              className="rounded-full bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              href="/login"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

