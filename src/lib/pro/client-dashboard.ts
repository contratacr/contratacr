import {z} from 'zod';

/**
 * Owner-configured customer view of one job (Houzz "Client Dashboard", family 33).
 * These are presentation preferences: hiding a section does not revoke access to
 * versions or files that were already shared. Changes and the completion report
 * stay visible because they can require a customer response.
 */
const workId=z.string().trim().min(1).max(160),stamp=z.string().datetime({offset:true});
export const CLIENT_DASHBOARD_WELCOME_MAX=1000;
const welcomeText=z.string().max(CLIENT_DASHBOARD_WELCOME_MAX).nullable();
const sections={showUpdates:z.boolean(),showDailyLogs:z.boolean(),showFiles:z.boolean()};

// showAllowances (family 75), showSelections (family 62), showSchedule (13) and showPunchlist (15) are opt-in and optional so earlier callers keep the stored value.
export const clientDashboardMutationSchema=z.object({workId,actionId:z.string().uuid(),revision:z.number().int().nonnegative().max(2147483646),...sections,showAllowances:z.boolean().optional(),showSelections:z.boolean().optional(),showSchedule:z.boolean().optional(),showPunchlist:z.boolean().optional(),showContracts:z.boolean().optional(),showMoodBoards:z.boolean().optional(),showFinances:z.boolean().optional(),showPaymentPlan:z.boolean().optional(),welcomeText}).strict();
export type ClientDashboardMutation=z.infer<typeof clientDashboardMutationSchema>;

const settingsShape={workId,...sections,welcomeText:z.string().min(1).max(CLIENT_DASHBOARD_WELCOME_MAX).nullable(),revision:z.number().int().nonnegative(),updatedAt:stamp.nullable()};
export const clientDashboardSettingsSchema=z.object({...settingsShape,showAllowances:z.boolean(),showSelections:z.boolean(),showSchedule:z.boolean(),showPunchlist:z.boolean(),showContracts:z.boolean(),showMoodBoards:z.boolean(),showFinances:z.boolean(),showPaymentPlan:z.boolean()}).strict();
/** History (and receipts) written before family 75 / 62 have no showAllowances / showSelections: they were off. */
const historySettingsSchema=z.object({...settingsShape,showAllowances:z.boolean().default(false),showSelections:z.boolean().default(false),showSchedule:z.boolean().default(false),showPunchlist:z.boolean().default(false),showContracts:z.boolean().default(false),showMoodBoards:z.boolean().default(false),showFinances:z.boolean().default(false),showPaymentPlan:z.boolean().default(false)}).strict();
export type ClientDashboardSettings=z.infer<typeof clientDashboardSettingsSchema>;

export const clientDashboardHistorySchema=z.object({actionId:z.string().uuid(),at:stamp,before:historySettingsSchema.nullable(),after:historySettingsSchema}).strict();
export const clientDashboardDetailSchema=z.object({settings:clientDashboardSettingsSchema,history:z.array(clientDashboardHistorySchema).max(20),recipientName:z.string().min(1).max(160).nullable(),previewRequestId:z.string().uuid().nullable().default(null)}).strict();
export type ClientDashboardDetail=z.infer<typeof clientDashboardDetailSchema>;

export const clientDashboardResultSchema=z.object({settings:historySettingsSchema}).strict();

export const appointmentDashboardSchema=z.object({...sections,welcomeText:z.string().min(1).max(CLIENT_DASHBOARD_WELCOME_MAX).nullable()}).strict();
export type AppointmentDashboard=z.infer<typeof appointmentDashboardSchema>;

/** The customer view before any customization: every section visible, no message. */
export const defaultAppointmentDashboard:AppointmentDashboard=Object.freeze({showUpdates:true,showDailyLogs:true,showFiles:true,welcomeText:null});

/** Normalize the editor text the same way the database does (trim, empty → null). */
export function normalizeWelcomeText(value:string){const trimmed=value.trim();return trimmed?trimmed:null;}
