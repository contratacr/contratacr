import { notFound } from 'next/navigation';
import { requirePro } from '@/lib/pro/server-access';
import { ProWorkspace } from '@/components/pro/pro-workspace';
export const dynamic = 'force-dynamic';
export default async function ProPage() {
 if (process.env.NODE_ENV !== 'development') notFound();
 await requirePro();
 return <ProWorkspace server/>;
}
