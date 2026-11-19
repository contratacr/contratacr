import { z } from 'zod';
export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const n=Date.parse(s+'T12:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s; });
export const monthSchema = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);
export const agendaCursor = z.object({ start:z.string().max(40),id:z.string().min(1).max(160) });
export const quoteCursor = z.object({ at:z.string().max(40),key:z.string().min(1).max(180) });
export function decodeCursor<T>(value:string|null|undefined,schema:z.ZodType<T>) {
 if(!value)return null;
 if(value.length>1000)throw Error('Cursor inválido');
 return schema.parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8')));
}
export function encodeCursor(value:unknown):string|null {return value?Buffer.from(JSON.stringify(value)).toString('base64url'):null;}
export type ProQuoteRow={id:string;key:string;title:string;client:string;total:number;status:string;at:string;legacy:boolean;clientId:string|null};
