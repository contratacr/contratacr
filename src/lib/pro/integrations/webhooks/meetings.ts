import {randomBytes} from 'node:crypto';
export const MEETING_PROVIDERS=['meet','teams','zoom'] as const;
export type MeetingProvider=typeof MEETING_PROVIDERS[number];
/**
 * Row 72: meeting link adapter. MOCK only: it returns a fictitious link on the reserved ".invalid" domain, which can never
 * resolve, so no real meeting is created. Real Google Meet / Teams / Zoom adapters need their OAuth apps (pending).
 */
export const mockMeetingUrl=(provider:MeetingProvider)=>`https://${provider}.contratacr.invalid/m/${randomBytes(9).toString('base64url')}`;
