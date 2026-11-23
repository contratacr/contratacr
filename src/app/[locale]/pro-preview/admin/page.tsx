import { notFound } from "next/navigation";
import { SocialPanel } from "@/components/pro/social-panel";
import {PRO_ENABLED} from '@/lib/pro/enabled';
export default function AdminSocialPreview() {
 if (!PRO_ENABLED) notFound();
 return <main className="mx-auto w-full min-w-0 max-w-4xl p-4"><SocialPanel admin/></main>;
}
