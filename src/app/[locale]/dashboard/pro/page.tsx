import {notFound,redirect} from 'next/navigation';
import {requirePro} from '@/lib/pro/server-access';
export const dynamic='force-dynamic';
export default async function ProPage(){if(process.env.NODE_ENV!=='development')notFound();await requirePro();redirect('/dashboard/profesional?tab=pro');}
