import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {proSameOrigin} from '@/lib/pro/route-common';
import {deleteConnection,getConnection,igFail,igHeaders,instagramAdapterOrNull} from '@/lib/integrations/instagram/server';

// GET → {connected, username, sandbox}; DELETE («Desconectar Instagram») → the stored token is deleted.
export async function GET(){
 const adapter=instagramAdapterOrNull();if(!adapter)return new Response(null,{status:404,headers:igHeaders});
 const user=await safeGetUser(await createClient());if(!user)return igFail(401,'login');
 try{
  const c=await getConnection(createAdminClient(),user.id,adapter);
  return Response.json({connected:!!c,username:c?.username??null,sandbox:adapter.provider==='sandbox'},{headers:igHeaders});
 }catch{return igFail(503,'unavailable');}
}
export async function DELETE(req:Request){
 const adapter=instagramAdapterOrNull();if(!adapter)return new Response(null,{status:404,headers:igHeaders});
 if(!proSameOrigin(req))return igFail(403,'origin','Origen no autorizado.');
 const user=await safeGetUser(await createClient());if(!user)return igFail(401,'login');
 try{await deleteConnection(createAdminClient(),user.id);return Response.json({connected:false},{headers:igHeaders});}catch{return igFail(503,'unavailable');}
}
