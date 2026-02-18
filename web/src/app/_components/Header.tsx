import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../../lib/supabase/server";
import { hasPublicSupabaseEnv } from "../../lib/env";
import HeaderShellClient from "./HeaderShellClient";

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
    const userId = data.user?.id ?? null;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", userId)
        .maybeSingle();
      isAdmin = Boolean(profile?.is_admin);
    }
  }

  return (
    <HeaderShellClient>
      <div className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Link
            className="text-sm font-black tracking-[0.18em] text-zinc-50"
            href="/"
            aria-label="Rekord home"
          >
            re<span className="text-pink-400">K</span>ord
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-zinc-300 sm:flex">
            <Link
              className="hover:text-white"
              href={userEmail ? "/new" : `/login?next=${encodeURIComponent("/new")}`}
            >
              New timeline
            </Link>
            {isAdmin ? (
              <Link
                className="hover:text-white"
                href="/admin/events"
              >
                Admin
              </Link>
            ) : null}
          </nav>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {userEmail ? (
            <>
              <span className="hidden max-w-[220px] truncate text-zinc-300 sm:inline">
                {userEmail}
              </span>
              <form action={signOut}>
                <button className="rounded-full border border-zinc-700 px-3 py-1.5 font-medium text-zinc-100 hover:bg-zinc-900">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              className="rounded-full bg-white px-3 py-1.5 font-medium text-zinc-900 hover:bg-zinc-200"
              href="/login"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </HeaderShellClient>
  );
}

