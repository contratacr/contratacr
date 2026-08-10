import { JobsPageContent } from "../page";

export default async function JobDetailRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams?: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const from = (await searchParams)?.from;
  return <JobsPageContent initialSelectedJobId={id} returnTo={from} detailOnly />;
}
