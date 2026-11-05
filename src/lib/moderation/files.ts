import type { SupabaseClient } from "@supabase/supabase-js";

/** No public scanner or content upload without explicit server configuration. */
export async function scanUpload(buffer: Uint8Array): Promise<void> {
  const endpoint=process.env.FILE_SCAN_URL;
  if(!endpoint) return; // Health panel explicitly reports scanner not configured.
  const url=new URL(endpoint);
  if(url.protocol!=="https:" || !process.env.FILE_SCAN_SECRET) throw new Error("Análisis de archivos no disponible.");
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/octet-stream",Authorization:`Bearer ${process.env.FILE_SCAN_SECRET}`},
    body:new Uint8Array(buffer),signal:AbortSignal.timeout(15000),cache:"no-store"});
  if(!response.ok) throw new Error("No se pudo analizar el archivo; intenta más tarde.");
  const result=await response.json();
  if(result.clean!==true) throw new Error("El archivo no superó el análisis de seguridad.");
}

/** Fail closed on quarantine lookup failure; never return a signed URL then. */
export async function quarantinedPaths(db: SupabaseClient,bucket: string,paths: string[]): Promise<Set<string>> {
  if(!paths.length) return new Set();
  const {data,error}=await db.from("moderation_files").select("path").eq("bucket",bucket).eq("status","quarantined").in("path",paths);
  if(error) throw new Error("No se pudo verificar la seguridad de los adjuntos.");
  return new Set((data??[]).map(r=>String(r.path)));
}
