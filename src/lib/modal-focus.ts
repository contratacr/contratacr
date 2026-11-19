// Safari/WebKit does not focus a <button> on click, so `activeElement` is
// still <body> when a dialog opens. Remember the last pressed control as the
// restoration fallback (only used when nothing else holds focus).
let lastPressed:{node:HTMLElement;at:number}|null=null;
if(typeof document!=='undefined')document.addEventListener('pointerdown',event=>{
 const node=event.target instanceof Element?event.target.closest<HTMLElement>('button,a[href],summary,[tabindex]'):null;
 lastPressed=node?{node,at:Date.now()}:null;
},true);
// A trigger that disabled itself while loading (busy) loses focus to <body>, or
// to a parent managed dialog that reclaims it; the pressed control is the real one.
function openingTrigger(doc:Document){
 const active=doc.activeElement,pressed=lastPressed;
 const fallback=active===doc.body||active instanceof HTMLElement&&active.hasAttribute('data-managed-modal-focus');
 if(fallback&&pressed&&pressed.node.ownerDocument===doc&&pressed.node.isConnected&&Date.now()-pressed.at<10000&&(active===doc.body||active!.contains(pressed.node)))return pressed.node;
 return active instanceof HTMLElement?active:null;
}

/** Opt-in keyboard ownership for Pro dialogs; conventional dialogs keep their behavior. */
export function manageModalFocus(dialog:HTMLElement,onClose:()=>void){
 const doc=dialog.ownerDocument,trigger=openingTrigger(doc);
 const visible=(node:HTMLElement)=>node.isConnected&&!node.closest('[inert],[aria-hidden="true"]')&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';
 const top=()=>Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(visible).at(-1);
 const focus=(node:HTMLElement,preventScroll=true)=>node.focus({preventScroll});
 const expanded=(node:HTMLElement)=>{
  let ancestor=node.parentElement;
  while(ancestor&&ancestor!==dialog){
   if(ancestor.tagName==='DETAILS'&&!ancestor.hasAttribute('open')){
    const summary=Array.from(ancestor.children).find(child=>child.tagName==='SUMMARY');
    if(!summary?.contains(node))return false;
   }
   ancestor=ancestor.parentElement;
  }
  return true;
 };
 const candidates=()=>Array.from(dialog.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]')).filter(node=>node.tabIndex>=0&&!node.matches(':disabled')&&visible(node)&&expanded(node)).sort((a,b)=>{const ai=a.tabIndex>0?a.tabIndex:Infinity,bi=b.tabIndex>0?b.tabIndex:Infinity;return ai-bi;});
 const ownedMenus=()=>Array.from(dialog.querySelectorAll<HTMLElement>('[aria-controls][aria-expanded="true"]')).filter(visible).flatMap(control=>(control.getAttribute('aria-controls')??'').split(/\s+/).filter(Boolean).map(id=>doc.getElementById(id))).filter((menu):menu is HTMLElement=>!!menu&&menu.getAttribute('role')==='menu'&&visible(menu));
 const key=(event:KeyboardEvent)=>{
  if(top()!==dialog)return;
  // Its own portal menu manages Escape, Tab and arrows before the dialog.
  if(ownedMenus().length)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onClose();return;}
  if(event.key!=='Tab')return;
  const nodes=candidates(),active=doc.activeElement,index=nodes.indexOf(active as HTMLElement);
  event.preventDefault();event.stopImmediatePropagation();
  if(!nodes.length){focus(dialog);return;}
  focus(nodes[index<0?(event.shiftKey?nodes.length-1:0):(index+(event.shiftKey?-1:1)+nodes.length)%nodes.length],false);
 };
 const contain=(event:FocusEvent)=>{if(top()===dialog&&!dialog.contains(event.target as Node)&&!ownedMenus().some(menu=>menu.contains(event.target as Node)))focus(dialog);};
 const observer=new MutationObserver(()=>{
  if(top()!==dialog)return;
  const active=doc.activeElement;
  if(active instanceof HTMLElement&&ownedMenus().some(menu=>menu.contains(active)))return;
  if(!active||active===doc.body||!active.isConnected||(active instanceof HTMLElement&&dialog.contains(active)&&(!visible(active)||!expanded(active)||active.matches(':disabled'))))focus(dialog);
 });
 observer.observe(dialog,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','hidden','open','inert','aria-hidden','style','class']});
 doc.addEventListener('keydown',key,true);doc.addEventListener('focusin',contain,true);
 if(top()===dialog)focus(dialog);
 return()=>{
  const owned=top()===dialog||!dialog.isConnected;
  observer.disconnect();
  doc.removeEventListener('keydown',key,true);doc.removeEventListener('focusin',contain,true);
  const remaining=Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(node=>node!==dialog&&visible(node)).at(-1);
  if(owned&&trigger?.isConnected&&(!remaining||remaining.contains(trigger)))focus(trigger);
  else if(owned&&remaining?.hasAttribute('data-managed-modal-focus'))focus(remaining);
  // A closing confirmation can remove its trigger later in the same commit.
  queueMicrotask(()=>{const active=doc.activeElement;if(owned&&remaining?.isConnected&&remaining.hasAttribute('data-managed-modal-focus')&&top()===remaining&&(!active||active===doc.body||!active.isConnected))focus(remaining);});
 };
}
