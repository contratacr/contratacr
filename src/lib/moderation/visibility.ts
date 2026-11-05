import { createAdminClient } from "@/lib/supabase/admin";
export async function contentIsHeld(kind:string,id:string){
 const {data,error}=await createAdminClient().rpc("content_is_held",{p_kind:kind,p_id:id});
 if(error)throw new Error("No se pudo comprobar la disponibilidad del contenido.");
 return data===true;
}
