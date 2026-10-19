# Desktop conversation actions

Desktop web Messages keeps the thread header focused on the recipient: avatar and profile link. Conversation actions now live in a visible three-dot button in each list row, using the shared viewport-clamped menu. Right-click opens the same menu. Escape restores focus to its trigger and clicking outside closes it.

Existing read/unread, archive/restore, report/block and per-account deletion operations are reused. Deletion requires confirmation; cancelling preserves the conversation. Narrow screens retain their swipe actions and bottom sheet. No schema or native build changes are needed.

Regression coverage lives in `tests/e2e/web-chat-parity.spec.ts`, including desktop menu placement, clean header, dismissals and archiving. Screenshots use disposable TEST accounts; no real conversations are modified.

Validation: shared inbox/parity and navbar brand suite passed 12/12 cases in Chromium desktop, Chromium mobile and WebKit mobile against TEST on 2026-10-19. Desktop assertions also cover outside-click dismissal and cancelling deletion. Scoped ESLint, TypeScript, bilingual budget, surface ownership and inventory checks passed. These browser checks do not constitute a new native store release.
