"use client";

import {
  Bell,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  Handshake,
  Headset,
} from "lucide-react";

export function NotificationSourceIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case "booking_received":
    case "booking_cancelled_by_client":
    case "booking_rescheduled":
      return <CalendarCheck className={className} />;
    case "new_project":
    case "proposal_accepted":
    case "project_cancelled":
    case "project_deleted":
      return <Handshake className={className} />;
    case "booking_confirmed":
    case "booking_cancelled":
    case "booking_completed":
    case "review_request":
      return <CalendarClock className={className} />;
    case "proposal_received":
    case "proposal_withdrawn":
      return <ClipboardList className={className} />;
    case "support_reply":
      return <Headset className={className} />;
    default:
      return <Bell className={className} />;
  }
}
