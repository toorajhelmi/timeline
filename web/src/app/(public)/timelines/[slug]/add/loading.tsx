export default function LoadingAddEntry() {
  return (
    <div className="dark min-h-screen bg-zinc-950 px-6 py-14 text-zinc-50">
      <main className="mx-auto w-full max-w-xl">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-6 text-zinc-100 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="relative grid h-10 w-10 place-items-center">
              <div className="absolute h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-white/70" />
              <div className="text-sm font-black tracking-[0.18em]">
                re<span className="text-pink-400">K</span>ord
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-200">Loading Add entry…</div>
              <div className="mt-0.5 text-[11px] text-zinc-400">
                Getting ready.
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <div className="h-10 w-full animate-pulse rounded-xl bg-white/10" />
            <div className="h-10 w-full animate-pulse rounded-xl bg-white/10" />
            <div className="h-24 w-full animate-pulse rounded-xl bg-white/10" />
            <div className="h-24 w-full animate-pulse rounded-xl bg-white/10" />
          </div>
        </div>
      </main>
    </div>
  );
}

