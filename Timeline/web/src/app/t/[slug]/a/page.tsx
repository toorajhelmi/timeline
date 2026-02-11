import TimelineCompareView from "../_components/TimelineCompareView";

export const dynamic = "force-dynamic";

export default async function TimelineViewA({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ z?: string; from?: string; to?: string; type?: string }>;
}) {
  const { slug } = await params;
  return <TimelineCompareView slug={slug} variant="A" searchParams={searchParams} />;
}

