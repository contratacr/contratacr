import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {checkPlacePhone} from '@/lib/directory/phone';

// Data quality report (2026-11-18), staff only (rendered by /admin/directorio after requireAdmin): phones of published
// places that are not a valid Costa Rican number (lib/directory/phone.ts). The public page does not offer them as
// «Llamar»; it shows them as plain text under «Otros datos». Read-only: fixing a phone goes through the usual place edit.
type Row={slug:string;name:string;vertical_id:string;phone:string;verification_level:string;claim_status:string};
async function loadRows():Promise<Row[]|null>{
 const db=createAdminClient(),out:Row[]=[];
 for(let from=0;from<200_000;from+=1000){
  const r=await db.from('dir_places').select('slug,name,vertical_id,phone,verification_level,claim_status').eq('status','published').not('phone','is',null).order('slug').range(from,from+999);
  if(r.error)return null;
  out.push(...(r.data as Row[]));
  if(r.data.length<1000)break;
 }
 return out;
}
export async function AdminPhoneReport({locale}:{locale:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const rows=await loadRows();
 if(!rows)return <section className="mx-auto mt-8 max-w-5xl px-4" data-admin-phone-report="error"><p role="alert">{t('No se pudo leer el informe de teléfonos.','Could not read the phone report.')}</p></section>;
 const flagged=rows.map(r=>({r,c:checkPlacePhone(r.phone)})).filter((x):x is {r:Row;c:Extract<NonNullable<ReturnType<typeof checkPlacePhone>>,{kind:'other'}>}=>x.c?.kind==='other');
 const foreign=flagged.filter(x=>x.c.reason==='foreign').length;
 return <section aria-labelledby="admin-phone-report" data-admin-phone-report={flagged.length} className="mx-auto mt-8 max-w-5xl space-y-3 px-4 pb-10 text-[#162543]">
  <h2 id="admin-phone-report" className="text-lg font-bold">{t('Teléfonos por revisar','Phones to review')}</h2>
  <p className="text-sm text-slate-700">{t(
   `${flagged.length} de ${rows.length} lugares publicados con teléfono no tienen un número costarricense válido (${foreign} de otro país, ${flagged.length-foreign} con formato inválido u obsoleto, p. ej. 7 dígitos). En la ficha no se ofrecen como «Llamar»: se muestran como texto en «Otros datos».`,
   `${flagged.length} of ${rows.length} published places with a phone have no valid Costa Rican number (${foreign} from another country, ${flagged.length-foreign} invalid or obsolete, e.g. 7 digits). The place page does not offer them as «Call»: they show as text under «Other details».`)}</p>
  {flagged.length>0&&<details className="rounded-2xl border border-slate-200 bg-white p-4">
   <summary className="min-h-11 cursor-pointer font-semibold">{t('Ver la lista','See the list')}</summary>
   <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
    <thead><tr className="border-b border-slate-200"><th className="py-2 pr-3">{t('Lugar','Place')}</th><th className="py-2 pr-3">{t('Sección','Section')}</th><th className="py-2 pr-3">{t('Teléfono','Phone')}</th><th className="py-2">{t('Motivo','Reason')}</th></tr></thead>
    <tbody>{flagged.map(({r,c})=><tr key={r.slug} data-admin-phone-row={r.slug} className="border-b border-slate-100 align-top">
     <td className="py-2 pr-3"><a className="font-semibold underline underline-offset-2" href={`${prefix}/lugar/${r.slug}`}>{r.name}</a></td>
     <td className="py-2 pr-3">{r.vertical_id}</td>
     <td className="py-2 pr-3 whitespace-nowrap">{r.phone}</td>
     <td className="py-2">{c.reason==='foreign'?t('Otro país','Another country'):t('Formato inválido u obsoleto','Invalid or obsolete format')}</td>
    </tr>)}</tbody>
   </table></div>
  </details>}
 </section>;
}
