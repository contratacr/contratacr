import { notFound } from 'next/navigation';
import { ProWorkspace } from '@/components/pro/pro-workspace';
export default function ProPreview() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ProWorkspace />;
}
