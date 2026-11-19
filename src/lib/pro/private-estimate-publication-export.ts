import {z} from 'zod';
import {privateEstimatePublicationSchema,type PrivateEstimatePublication} from './private-estimate-publications';
import {renderPrivateEstimatePdfDocument} from './private-estimate-export';

function canonical(value:unknown):string{
 const sorted=(item:unknown):unknown=>Array.isArray(item)?item.map(sorted):item!==null&&typeof item==='object'?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>[key,sorted(v)])):item;
 return JSON.stringify(sorted(value));
}
/** Publication identity excludes mutable decisions and private owner projection.
 * No decision status appears in this document: it is the immutable shared version. */
export function privateEstimatePublicationPdfIdentity(value:PrivateEstimatePublication):string{
 const parsed=privateEstimatePublicationSchema.parse(value);
 return canonical({publicationId:parsed.publicationId,version:parsed.version,estimateRevision:parsed.estimateRevision,contentHash:parsed.contentHash,content:parsed.content,createdAt:parsed.createdAt});
}

export async function createPrivateEstimatePublicationPdf(value:PrivateEstimatePublication,{english,accountId,currentAccount,verifySaved}:{english:boolean;accountId:string;currentAccount:()=>string|undefined;verifySaved:()=>Promise<PrivateEstimatePublication>}):Promise<Blob>{
 const actor=z.string().uuid().parse(accountId),snapshot=privateEstimatePublicationSchema.parse(JSON.parse(JSON.stringify(value))),identity=privateEstimatePublicationPdfIdentity(snapshot);
 const scope=()=>{if(currentAccount()!==actor)throw Error('Publication export account changed');};
 const verify=async()=>{
  scope();const current=privateEstimatePublicationSchema.parse(await verifySaved());scope();
  if(privateEstimatePublicationPdfIdentity(current)!==identity)throw Error(english?'The shared version changed. Refresh before exporting.':'La versión compartida cambió. Actualice antes de exportar.');
 };
 scope();
 return renderPrivateEstimatePdfDocument({...snapshot.content,client:snapshot.content.customer},{english,scope,verify,reference:snapshot.publicationId.slice(0,8).toUpperCase(),version:snapshot.version,badge:english?'Shared version':'Versión compartida',footer:english?'Shared version':'Versión compartida',subject:(english?'Shared quote - version ':'Cotización compartida - versión ')+snapshot.version,publishedAt:snapshot.createdAt});
}
