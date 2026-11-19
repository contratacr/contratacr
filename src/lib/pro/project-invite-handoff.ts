/**
 * Round 7A (2026-11-13): the job invitation code survives the sign-in. The code travels only in the
 * URL fragment (#codigo=…), never in the query string or server logs. When the customer is not
 * signed in, the page keeps it in THIS tab's sessionStorage for 30 minutes, removes it from the
 * address bar and goes to sign-in; after signing in, the join page reads it once and deletes it.
 */
const KEY='ccr:project-invite-code';
const TTL=30*60*1000;
export function stashProjectInviteCode(code:string){
 try{sessionStorage.setItem(KEY,JSON.stringify({code:code.slice(0,200),at:Date.now()}));return true;}catch{return false;}
}
export function takeProjectInviteCode():string|null{
 try{const raw=sessionStorage.getItem(KEY);sessionStorage.removeItem(KEY);if(!raw)return null;const value=JSON.parse(raw) as {code?:unknown;at?:unknown};
  return typeof value.code==='string'&&typeof value.at==='number'&&Date.now()-value.at>=0&&Date.now()-value.at<TTL?value.code:null;}catch{return null;}
}

/**
 * Launch fixes (2026-11-17): once the customer joins, the result (only the request id, never the code) is
 * remembered in THIS tab for 30 minutes, so a reload (Back/refresh, a dev full reload) still shows the
 * confirmation and the link to the job instead of an empty code form. The code itself keeps its contract:
 * it is consumed from storage as soon as it reaches the form and is never kept around.
 */
const JOINED_KEY='ccr:project-invite-joined';
export function rememberProjectInviteJoined(requestId:string){
 try{sessionStorage.removeItem(KEY);sessionStorage.setItem(JOINED_KEY,JSON.stringify({requestId:requestId.slice(0,64),at:Date.now()}));return true;}catch{return false;}
}
/** Request id of a job joined in this tab within the last 30 minutes ('' when the server gave none), or null. */
export function readProjectInviteJoined():string|null{
 try{const raw=sessionStorage.getItem(JOINED_KEY);if(!raw)return null;const value=JSON.parse(raw) as {requestId?:unknown;at?:unknown};
  if(typeof value.requestId==='string'&&typeof value.at==='number'&&Date.now()-value.at>=0&&Date.now()-value.at<TTL)return value.requestId;
  sessionStorage.removeItem(JOINED_KEY);return null;}catch{return null;}
}
export function forgetProjectInviteJoined(){try{sessionStorage.removeItem(JOINED_KEY);}catch{/* storage unavailable */}}
