import {z} from 'zod';

/** Projects hub (Houzz "Projects"): a read-only view over existing jobs. */
export const projectStatuses=['open','in_progress','completed','cancelled'] as const;
export type ProjectStatus=typeof projectStatuses[number];
export const projectFilters=['active','open','in_progress','completed','cancelled','all'] as const;
export type ProjectFilter=typeof projectFilters[number];

export const projectQuerySchema=z.object({status:z.enum(projectFilters).default('active'),q:z.string().max(160).default(''),after:z.coerce.number().int().positive().optional()}).strict();

export const projectSchema=z.object({
 id:z.string().min(1).max(160),name:z.string().max(160),client:z.string().max(160),clientId:z.string().min(1).max(160),
 status:z.enum(projectStatuses),start:z.string().nullable(),end:z.string().nullable(),hasQuote:z.boolean(),linkedCustomer:z.boolean(),customView:z.boolean(),
}).strict();
export type Project=z.infer<typeof projectSchema>;
const count=z.number().int().nonnegative();
export const projectsPageSchema=z.object({items:z.array(projectSchema).max(20),nextCursor:z.number().int().positive().nullable(),counts:z.object({open:count,in_progress:count,completed:count,cancelled:count,all:count}).strict()}).strict();
export type ProjectsPage=z.infer<typeof projectsPageSchema>;
