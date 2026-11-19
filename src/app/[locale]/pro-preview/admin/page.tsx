import { notFound } from "next/navigation";
import { SocialPanel } from "@/components/pro/social-panel";
export default function AdminSocialPreview() {
 if (process.env.NODE_ENV !== "development") notFound();
 return <main className="mx-auto w-full min-w-0 max-w-4xl p-4"><SocialPanel admin/></main>;
}
