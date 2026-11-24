import type {ReactNode} from 'react';
import {parseMessage,type Inline} from '@/lib/pro/message-format';

/** Renders the light message formatting as React nodes (never as HTML strings). Links are https only and open in a new tab. */
function inline(items:Inline[],key=''):ReactNode[]{
 return items.map((item,index)=>{const k=key+index;
  if(item.t==='text')return item.v;
  if(item.t==='a')return <a key={k} href={item.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">{inline(item.c,k+'.')}</a>;
  if(item.t==='b')return <strong key={k}>{inline(item.c,k+'.')}</strong>;
  if(item.t==='i')return <em key={k}>{inline(item.c,k+'.')}</em>;
  return <u key={k}>{inline(item.c,k+'.')}</u>;});
}
export function MessageRichText({body}:{body:string}){
 return <div data-message-rich className="space-y-1 break-words">{parseMessage(body).map((block,index)=>{
  if(block.t==='subject')return <p key={index} className="font-bold">{inline(block.c)}</p>;
  if('items' in block){const items=block.items.map((item,i)=><li key={i}>{inline(item)}</li>);return block.t==='ul'?<ul key={index} className="list-disc space-y-0.5 pl-5">{items}</ul>:<ol key={index} className="list-decimal space-y-0.5 pl-5">{items}</ol>;}
  return <p key={index} className="whitespace-pre-wrap">{inline(block.c)}</p>;})}</div>;
}
