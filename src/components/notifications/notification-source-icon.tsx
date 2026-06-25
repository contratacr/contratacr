"use client";

import {
  Bell,
  ClipboardList,
  Headset,
  Inbox,
  Send,
  FolderOpen,
} from "lucide-react";

export function NotificationSourceIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case "booking_received":
    case "booking_rescheduled":
      return <Inbox className={className} />;
    case "new_project":
    case "proposal_accepted":
      return <FolderOpen className={className} />;
    case "booking_confirmed":
    case "booking_cancelled":
    case "booking_completed":
    case "review_request":
      return <Send className={className} />;
    case "proposal_received":
      return <ClipboardList className={className} />;
    case "support_reply":
      return <Headset className={className} />;
    default:
      return <Bell className={className} />;
  }
}
