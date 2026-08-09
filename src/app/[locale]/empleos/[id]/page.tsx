import { JobsPageContent } from "../page";

export default async function JobDetailRedirect({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  return <JobsPageContent initialSelectedJobId={id} />;
}
