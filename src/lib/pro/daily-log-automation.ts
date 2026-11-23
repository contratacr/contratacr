import {z} from 'zod';
import {weatherProviderChoices} from '@/lib/pro/weather';
/** Row 20 (405): contracts of the daily log weather/automation settings and the automatic draft run. */
const rev=z.number().int().min(0).max(2147483646);
export const dailyLogSettingsSchema=z.object({
 weather:z.object({provider:z.enum(weatherProviderChoices),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),place:z.string().max(120),revision:rev}).strict(),
 automation:z.object({enabled:z.boolean(),includeWeather:z.boolean(),lookbackDays:z.number().int().min(1).max(7),revision:rev}).strict()}).strict();
export type DailyLogSettings=z.infer<typeof dailyLogSettingsSchema>;
export const dailyLogSettingsSaveSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('weather'),revision:rev,provider:z.enum(weatherProviderChoices),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),place:z.string().trim().max(120)}).strict(),
 z.object({kind:z.literal('automation'),revision:rev,enabled:z.boolean(),includeWeather:z.boolean(),lookbackDays:z.number().int().min(1).max(7)}).strict()]);
export const dailyLogAutomationRunSchema=z.object({workId:z.string().min(1).max(160),lang:z.enum(['es','en'])}).strict();
export const dailyLogAutomationResultSchema=z.object({enabled:z.boolean(),created:z.number().int().min(0).max(5)}).strict();
export const AUTO_DRAFT_LIMIT=5;
