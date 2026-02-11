import { redirect } from "next/navigation";

import { requireAdmin } from "../../../lib/auth/admin";

async function setReportStatus(formData: FormData) {
  "use server";

  const reportId = String(formData.get("report_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!reportId) redirect("/admin/reports");

  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("reports")
    .update({ status })
    .eq("id", reportId);

  if (error) redirect(`/admin/reports?error=${encodeURIComponent(error.message)}`);
  redirect("/admin/reports");
}

export const dynamic = "force-dynamic";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const { supabase } = await requireAdmin();

  const { data: reports, error } = await supabase
    .from("reports")
    .select("id,reporter_id,object_type,object_id,reason,status,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <main className="mx-auto w-full max-w-5xl">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            Failed to load reports: {error.message}
          </div>
        </main>
      </div>
    );
  }

  const sp = (await searchParams) ?? {};
  const pageError = sp.error;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-14 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Admin · Reports</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Review user reports. Update status as triaged/resolved/dismissed.
          </p>
        </header>

        {pageError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {pageError}
          </div>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-600 dark:text-zinc-400">
                <tr>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Object</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {(reports ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-3 pr-4 text-xs text-zinc-600 dark:text-zinc-400">
                      {new Date(r.created_at).toISOString()}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="text-xs text-zinc-600 dark:text-zinc-400">
                        {r.object_type}
                      </div>
                      <div className="font-mono text-xs">{r.object_id}</div>
                    </td>
                    <td className="py-3 pr-4 max-w-[520px]">
                      <div className="line-clamp-3">{r.reason}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs dark:border-zinc-800">
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <form action={setReportStatus} className="flex items-center gap-2">
                        <input type="hidden" name="report_id" value={r.id} />
                        <select
                          className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
                          name="status"
                          defaultValue={r.status}
                        >
                          <option value="open">open</option>
                          <option value="triaged">triaged</option>
                          <option value="resolved">resolved</option>
                          <option value="dismissed">dismissed</option>
                        </select>
                        <button className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {(reports ?? []).length === 0 && (
                  <tr>
                    <td className="py-6 text-sm text-zinc-600 dark:text-zinc-400" colSpan={5}>
                      No reports.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

