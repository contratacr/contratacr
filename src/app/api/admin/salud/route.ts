import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { privateHeaders as headers } from "@/lib/moderation/admin";

export const dynamic="force-dynamic";
export async function GET() {
  if(!(await getApiAdmin())) return NextResponse.json({error:"No autorizado"},{status:403,headers});
  const db=createAdminClient(), since=new Date(Date.now()-86400000).toISOString(), stale=new Date(Date.now()-10*60000).toISOString();
  const definitions = [
    {key:"push_failed",label:"Push fallidos · últimas 24 h",query:()=>db.from("notification_push_outbox").select("id",{count:"exact",head:true}).eq("status","failed").gte("created_at",since)},
    {key:"push_stale",label:"Push pendientes hace más de 10 min",query:()=>db.from("notification_push_outbox").select("id",{count:"exact",head:true}).in("status",["pending","processing"]).lt("created_at",stale)},
    {key:"push_suppressed",label:"Push suprimidos · últimas 24 h",query:()=>db.from("notification_push_outbox").select("id",{count:"exact",head:true}).eq("status","suppressed").gte("created_at",since)},
    {key:"errors",label:"Errores de la app · últimas 24 h",query:()=>db.from("client_errors").select("id",{count:"exact",head:true}).gte("created_at",since)},
    {key:"deletions",label:"Eliminaciones pendientes o fallidas",query:()=>db.from("account_deletion_requests").select("id",{count:"exact",head:true}).in("status",["pending","processing","failed"])},
    {key:"reports",label:"Reportes abiertos hace más de 24 h",query:()=>db.from("reports").select("id",{count:"exact",head:true}).eq("status","open").lt("created_at",since)},
    {key:"email_failed",label:"Correos fallidos · últimas 24 h",query:()=>db.from("email_deliveries").select("id",{count:"exact",head:true}).eq("status","failed").gte("created_at",since)},
    {key:"files",label:"Archivos señalados en cuarentena",query:()=>db.from("moderation_files").select("id",{count:"exact",head:true}).eq("status","quarantined")},
    {key:"retention",label:"Limpieza de auditoría sin programación automática",query:()=>db.from("moderation_retention_state").select("id",{count:"exact",head:true}).eq("scheduled",false)},
    {key:"retention_stale",label:"Limpieza de auditoría sin ejecución en 48 h",query:()=>db.from("moderation_retention_state").select("id",{count:"exact",head:true}).or(`last_run_at.is.null,last_run_at.lt.${new Date(Date.now()-48*3600000).toISOString()}`)},
  ];
  const results=await Promise.all(definitions.map(async d=>{
    try { const r=await d.query(); return {key:d.key,label:d.label,count:r.error?null:r.count,error:!!r.error}; }
    catch { return {key:d.key,label:d.label,count:null,error:true}; }
  }));
  return NextResponse.json({checkedAt:new Date().toISOString(),rows:results,scannerConfigured:!!process.env.FILE_SCAN_URL&&!!process.env.FILE_SCAN_SECRET,
    note:"Aceptación del proveedor no equivale a recepción o lectura. Suprimidos pueden no tener dispositivo elegible o haber vencido; no se reenvían desde aquí."},{headers});
}
