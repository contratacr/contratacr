"use client";

import {
  Bell,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  Handshake,
  Headset,
  Megaphone,
  Star,
  UserPlus,
} from "lucide-react";

export function NotificationSourceIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case "booking_received":
    case "booking_cancelled_by_client":
    case "booking_completed_by_client":
    case "booking_rescheduled":
      return <CalendarCheck className={className} />;
    case "new_project":
    case "proposal_accepted":
    case "project_proposal_accepted":
    case "project_proposal_declined":
    case "project_cancelled":
    case "project_deleted":
    case "project_completed":
      return <Handshake className={className} />;
    case "booking_confirmed":
    case "booking_cancelled":
    case "booking_completed":
    case "booking_update":
    case "review_request":
      return <CalendarClock className={className} />;
    case "review_received":
      return <Star className={className} />;
    case "professional_follow":
      return <UserPlus className={className} />;
    case "followed_professional_activity":
      return <Megaphone className={className} />;
    case "job_application":
    case "job_application_status":
      return <BriefcaseBusiness className={className} />;
    case "proposal_received":
    case "proposal_updated":
    case "proposal_withdrawn":
    case "project_work_done":
      return <ClipboardList className={className} />;
    case "support_reply":
      return <Headset className={className} />;
    default:
      return <Bell className={className} />;
  }
}
