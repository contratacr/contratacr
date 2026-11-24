/**
 * Messages: light formatting stored as plain text (no HTML ever reaches the page).
 * **bold**, *italic*, __underline__, [text](https://link), lines starting with "- " (bullets) or "1. " (numbers),
 * and an optional subject kept in the first line as "# subject".
 */
export type Inline={t:'text';v:string}|{t:'b'|'i'|'u';c:Inline[]}|{t:'a';href:string;c:Inline[]};
export type Block={t:'p';c:Inline[]}|{t:'ul'|'ol';items:Inline[][]}|{t:'subject';c:Inline[]};
const SAFE_LINK=/^https:\/\/[^\s<>"']{3,500}$/i;
export const isSafeLink=(value:string)=>SAFE_LINK.test(value);
const PAIRS:[string,'b'|'i'|'u'][]=[['**','b'],['__','u'],['*','i']];
export function parseInline(text:string,depth=0):Inline[]{
 const out:Inline[]=[];let i=0,buffer='';
 const flush=()=>{if(buffer){out.push({t:'text',v:buffer});buffer='';}};
 while(i<text.length){
  if(text[i]==='['&&depth<3){const m=/^\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/.exec(text.slice(i));if(m&&isSafeLink(m[2])){flush();out.push({t:'a',href:m[2],c:parseInline(m[1],depth+1)});i+=m[0].length;continue;}}
  let matched=false;
  if(depth<3)for(const [mark,tag] of PAIRS){
   if(text.startsWith(mark,i)){const end=text.indexOf(mark,i+mark.length);if(end>i+mark.length){const inner=text.slice(i+mark.length,end);if(inner.trim()&&!inner.includes('\n')){flush();out.push({t:tag,c:parseInline(inner,depth+1)});i=end+mark.length;matched=true;break;}}}
  }
  if(!matched){buffer+=text[i];i++;}
 }
 flush();return out;
}
export function parseMessage(body:string):Block[]{
 const lines=body.replace(/\r\n?/g,'\n').split('\n'),blocks:Block[]=[];let list:{t:'ul'|'ol';items:Inline[][]}|null=null,para:string[]=[];
 const endPara=()=>{if(para.length){blocks.push({t:'p',c:parseInline(para.join('\n'))});para=[];}};
 const endList=()=>{if(list){blocks.push(list);list=null;}};
 lines.forEach((line,index)=>{
  const subject=index===0?/^# (.{1,200})$/.exec(line):null,bullet=/^[-•] (.+)$/.exec(line),number=/^\d{1,2}[.)] (.+)$/.exec(line);
  if(subject){blocks.push({t:'subject',c:parseInline(subject[1])});return;}
  if(bullet||number){endPara();const kind=bullet?'ul':'ol';if(list&&list.t!==kind)endList();list=list??{t:kind,items:[]};list.items.push(parseInline((bullet??number)![1]));return;}
  endList();if(!line.trim()){endPara();return;}para.push(line);
 });
 endList();endPara();return blocks;
}
/** Plain text of a message (formatting removed): used for notifications and the "last message" line. */
export function plainMessage(body:string){
 const text=(items:Inline[]):string=>items.map(x=>x.t==='text'?x.v:text(x.c)).join('');
 return parseMessage(body).map(b=>'items' in b?b.items.map(i=>'• '+text(i)).join('\n'):text(b.c)).join('\n').trim();
}
export type FormatAction='bold'|'italic'|'underline'|'bullets'|'numbers'|'link'|'unlink';
/** Applies a toolbar action to the selection of the text; returns the new text and selection. */
export function applyFormat(value:string,start:number,end:number,action:FormatAction,url=''):{value:string;start:number;end:number}{
 const before=value.slice(0,start),sel=value.slice(start,end),after=value.slice(end);
 const wrap=(mark:string)=>{const inner=sel||'texto';return{value:before+mark+inner+mark+after,start:start+mark.length,end:start+mark.length+inner.length};};
 if(action==='bold')return wrap('**');if(action==='italic')return wrap('*');if(action==='underline')return wrap('__');
 if(action==='link'){const inner=sel||'enlace',href=url.trim(),text=`[${inner}](${href})`;return isSafeLink(href)?{value:before+text+after,start:start+1,end:start+1+inner.length}:{value,start,end};}
 if(action==='unlink'){const re=/\[([^\]\n]*)\]\([^)\s]*\)/g;const next=sel.replace(re,'$1');return{value:before+next+after,start,end:start+next.length};}
 const lineStart=before.lastIndexOf('\n')+1,block=value.slice(lineStart,end).split('\n');
 const stripped=block.map(line=>line.replace(/^([-•]|\d{1,2}[.)]) /,''));
 const next=stripped.map((line,index)=>action==='bullets'?'- '+line:`${index+1}. `+line).join('\n');
 const turnOff=block.every(line=>action==='bullets'?/^[-•] /.test(line):/^\d{1,2}[.)] /.test(line));
 const result=turnOff?stripped.join('\n'):next;
 return{value:value.slice(0,lineStart)+result+after,start:lineStart,end:lineStart+result.length};
}
