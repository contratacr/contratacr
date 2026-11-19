import {z} from 'zod';
import {invoiceIssuerSchema} from './invoice-preparation';
export const issuerSettingsSchema=z.object({revision:z.number().int().min(0),issuer:invoiceIssuerSchema.extend({issuerName:z.string().trim().min(1,'Indique el nombre del emisor.').max(160)})});
