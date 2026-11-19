/**
 * Fix 14: the customer's linked job («Mi proyecto» / «My project») is its own page,
 * /[en/]dashboard/mi-proyecto/<requestId>. Only the linked customer of that request opens it
 * (checked on the server with the same reader as the appointment detail).
 */
export const CLIENT_PROJECT_ROUTE=/^\/(?:(es|en)\/)?dashboard\/mi-proyecto\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
export const isClientProjectId=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
/** Locale-less path (for the i18n router) of a customer's project page. */
export const clientProjectPagePath=(requestId:string,returnTo?:string|null)=>'/dashboard/mi-proyecto/'+encodeURIComponent(requestId)+(returnTo?'?'+new URLSearchParams({returnTo}):'');
/** Session marker: the page was opened from inside the app, so its back button can use history. */
export const CLIENT_PROJECT_FROM_APP='ccr-client-project-from-app';
// One token per loaded document: a marker written in another document (an earlier visit, a reload, a direct link) never counts.
let token:string|null=null;
const documentToken=()=>token??=Math.random().toString(36).slice(2);
export const markClientProjectFromApp=(requestId:string)=>{try{sessionStorage.setItem(CLIENT_PROJECT_FROM_APP,requestId+':'+documentToken());}catch{}};
export const takeClientProjectFromApp=(requestId:string)=>{try{const ok=sessionStorage.getItem(CLIENT_PROJECT_FROM_APP)===requestId+':'+documentToken();sessionStorage.removeItem(CLIENT_PROJECT_FROM_APP);return ok;}catch{return false;}};
