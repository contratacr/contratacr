'use client';
import {z} from 'zod';
import {extrasRowSchema} from '@/lib/pro/project-extras';

/** Client helpers for /api/pro/project-extras (area C). */
export type ExtrasRow={revision:number;data:Record<string,unknown>};
const listSchema=z.object({items:z.record(z.string(),extrasRowSchema),links:z.record(z.string(),z.object({phase:z.string().nullable(),start:z.string().nullable(),end:z.string().nullable()})).optional()});
export async function readExtras(params:Record<string,string>){
 const response=await fetch('/api/pro/project-extras?'+new URLSearchParams(params),{cache:'no-store'});
 if(!response.ok)throw Error('read');
 return listSchema.parse(await response.json());
}
export class ExtrasConflict extends Error{}
export async function saveExtras(body:Record<string,unknown>){
 const response=await fetch('/api/pro/project-extras',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(response.status===409)throw new ExtrasConflict('conflict');
 if(!response.ok)throw Error('save');
 return z.object({item:extrasRowSchema}).parse(await response.json()).item;
}
