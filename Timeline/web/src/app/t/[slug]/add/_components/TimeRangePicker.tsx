"use client";

import { useEffect, useMemo, useState } from "react";

function localToUtcIso(local: string): string {
  const s = String(local ?? "").trim();
  if (!s) return "";
  const d = new Date(s); // interpreted as local time in the browser
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function nowLocalInputValue(): string {
  const now = new Date();
  // Convert to local "YYYY-MM-DDTHH:mm"
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();
  return local.slice(0, 16);
}

export default function TimeRangePicker() {
  const [startLocal, setStartLocal] = useState<string>("");
  const [endLocal, setEndLocal] = useState<string>("");

  // Set default on the client to avoid server timezone influencing the default value.
  useEffect(() => {
    setStartLocal(nowLocalInputValue());
  }, []);

  const startUtc = useMemo(() => localToUtcIso(startLocal), [startLocal]);
  const endUtc = useMemo(() => localToUtcIso(endLocal), [endLocal]);

  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div>
        <label className="text-sm font-medium" htmlFor="time_start">
          Time start
        </label>
        <input
          className="datetime-input mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
          id="time_start"
          name="time_start"
          type="datetime-local"
          value={startLocal}
          onChange={(e) => setStartLocal(e.target.value)}
          required
        />
        <input type="hidden" name="time_start_utc" value={startUtc} />
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="time_end">
          Time end (optional)
        </label>
        <input
          className="datetime-input mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
          id="time_end"
          name="time_end"
          type="datetime-local"
          value={endLocal}
          onChange={(e) => setEndLocal(e.target.value)}
        />
        <input type="hidden" name="time_end_utc" value={endUtc} />
      </div>
    </div>
  );
}

