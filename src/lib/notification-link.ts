// Maps a notification to the page it should open when clicked.
// Prefers an explicit `data.link` stored at creation time; otherwise falls back
// to a sensible destination derived from the notification type so that
// click-through works for every notification — including legacy rows.
export type NotificationLinkInput = {
  type: string;
  data?: { link?: string } | null;
};

export function notificationHref(n: NotificationLinkInput): string {
  if (n.data?.link) return n.data.link;
  switch (n.type) {
    case "booking_received":
      return "/es/dashboard/profesional?tab=bookings";
    case "booking_confirmed":
    case "booking_cancelled":
    case "booking_rescheduled":
    case "booking_completed":
    case "review_request":
      return "/es/dashboard/cliente?tab=bookings";
    case "proposal_received":
      return "/es/dashboard/cliente?tab=projects";
    case "proposal_accepted":
      return "/es/dashboard/profesional?tab=proposals";
    case "new_project":
      return "/es/dashboard/profesional";
    default:
      return "/es/dashboard/cliente?tab=notifications";
  }
}
