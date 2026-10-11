"use client";

import type { ReactNode } from "react";
import { MailCheck, MailX } from "lucide-react";
import { PanelEmptyState } from "@/components/ui/content-loading";

export function UnsubscribeResult({ success, title, description, action }: {
  success: boolean; title: string; description: string; action: ReactNode;
}) {
  return <PanelEmptyState plano icon={success ? MailCheck : MailX} title={title}
    description={description} className="px-5 py-14" action={action} />;
}
