import {PRO_ENABLED} from '@/lib/pro/enabled';

// Row 73 (web/PWA only): installable manifest for the Pro space. Static, public and without any account data. The store apps
// (iOS/Android binaries, native push, device capabilities) are out of scope: see docs/pro/mobile-web-experience-local.md.
const headers={'Content-Type':'application/manifest+json; charset=utf-8','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'};
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
 const en=new URL(req.url).searchParams.get('lang')==='en',base=en?'/en':'',pro=base+'/dashboard/pro';
 const shortcut=(name:string,short:string,tab:string)=>({name,short_name:short,url:pro+'?tab='+tab,icons:[{src:'/web-app-manifest-192x192.png',sizes:'192x192',type:'image/png'}]});
 return Response.json({
  id:pro,name:'ContrataCR Pro',short_name:'Pro',description:en?'Run your jobs, quotes, tasks and customers from your phone.':'Gestione trabajos, cotizaciones, tareas y clientes desde su teléfono.',
  start_url:pro,scope:'/',display:'standalone',display_override:['standalone','browser'],orientation:'any',lang:en?'en':'es-CR',
  theme_color:'#ffffff',background_color:'#ffffff',categories:['business','productivity'],
  icons:[
   {src:'/web-app-manifest-192x192.png',sizes:'192x192',type:'image/png',purpose:'maskable'},
   {src:'/web-app-manifest-512x512.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
  ],
  shortcuts:[
   shortcut(en?'Projects':'Proyectos',en?'Projects':'Proyectos','pro_projects'),shortcut(en?'Tasks':'Tareas',en?'Tasks':'Tareas','pro_tasks'),
   shortcut(en?'Schedule':'Agenda',en?'Schedule':'Agenda','pro_agenda'),shortcut(en?'Customers':'Clientes',en?'Customers':'Clientes','pro_clients'),
  ],
 },{headers});
}
