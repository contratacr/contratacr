"use client";
import { useEffect,useState } from "react";
import { useLocale,useTranslations } from "next-intl";
type Decision={id:string;decision_reason:string;status:string;appealed_at:string|null;created_at:string};
export function ModerationDecisions(){
 const locale=useLocale(),t=useTranslations("moderation");
 const [rows,setRows]=useState<Decision[]|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{const controller=new AbortController();fetch("/api/moderation/decisions",{cache:"no-store",signal:controller.signal}).then(async r=>{if(!r.ok)throw Error(t("loadError"));return r.json();}).then(d=>setRows(d.rows)).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return ()=>controller.abort();},[t]);
 async function appeal(d:Decision){
  const reason=window.prompt(t("appealPrompt"));if(!reason||reason.trim().length<15)return;
  setBusy(true);setError("");try{const r=await fetch("/api/moderation/decisions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({report:d.id,reason})});if(!r.ok)throw Error(t("appealError"));setRows(current=>(current??[]).map(v=>v.id===d.id?{...v,appealed_at:new Date().toISOString(),status:"open"}:v));}catch(e){setError(e instanceof Error?e.message:"Error");}finally{setBusy(false);}
 }
 if(!error&&rows?.length===0)return null;
 return <section className="my-4 space-y-3 rounded-xl border p-4"><h2 className="font-bold">{t("decisionsTitle")}</h2>{error&&<p role="alert">{error}</p>}{rows===null&&!error&&<p>{t("loading")}</p>}{rows?.map(d=><article key={d.id} className="space-y-2 border-t pt-3"><p className="whitespace-pre-wrap break-words text-sm">{d.decision_reason}</p><p className="text-xs">{new Date(d.created_at).toLocaleDateString(locale)}</p>{d.status==="resolved"&&!d.appealed_at?<button className="rounded-xl border p-3 text-sm" disabled={busy} onClick={()=>void appeal(d)}>{t("requestReview")}</button>:<p className="text-sm">{t("followSupport")}</p>}</article>)}</section>;
}
