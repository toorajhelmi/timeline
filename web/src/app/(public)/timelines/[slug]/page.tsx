import TimelineView from "@/components/timelines/TimelineView";

export const dynamic = "force-dynamic";

export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ z?: string; from?: string; to?: string; type?: string }>;
}) {
  const { slug } = await params;
  return <TimelineView slug={slug} searchParams={searchParams} />;
}

