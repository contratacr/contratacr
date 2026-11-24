import {z} from 'zod';
/** Area D: automatic reference number (GA-00001) and Taxable flag of an internal expense (side table pro_expense_meta). */
export const expenseMetaSchema=z.object({expenseId:z.string().uuid(),ref:z.string().regex(/^GA-\d{5,12}$/),taxable:z.boolean(),revision:z.number().int().positive()}).strict();
export type ExpenseMeta=z.infer<typeof expenseMetaSchema>;
export const expenseMetaMutationSchema=z.object({expenseId:z.string().uuid(),revision:z.number().int().min(1).max(999999999),taxable:z.boolean()}).strict();
