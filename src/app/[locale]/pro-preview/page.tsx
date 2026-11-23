import { notFound } from 'next/navigation';
import { ProWorkspace } from '@/components/pro/pro-workspace';
import {PRO_ENABLED} from '@/lib/pro/enabled';
export default function ProPreview() {
  if (!PRO_ENABLED) notFound();
  return <ProWorkspace />;
}
