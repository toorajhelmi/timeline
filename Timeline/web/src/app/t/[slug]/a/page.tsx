import TimelineView from "../_components/TimelineView";

export const dynamic = "force-dynamic";

export default async function TimelineViewA({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ z?: string; from?: string; to?: string; type?: string }>;
}) {
  const { slug } = await params;
  return <TimelineView slug={slug} variant="A" searchParams={searchParams} />;
}

