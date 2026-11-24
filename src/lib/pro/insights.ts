/** Area E: marketing insights. Pure checklists computed from data ContrataCR already has (profile, published site). */
export const insightsPages=['exposure','profile','photos','website','leads','campaigns'] as const;
export type InsightsPage=typeof insightsPages[number];
export type InsightsSite={profile:{bio:string;services:{name:string}[];photos:string[];rating:{average:number|null;count:number|null}};site:{published:boolean;sections:{type:string;enabled:boolean}[]}|null;submissions:number};
export const BIO_MIN=60,PHOTOS_MIN=5;
export function insightsChecklist(d:InsightsSite,en:boolean){
 const t=(es:string,english:string)=>en?english:es;
 return [
  {key:'description',title:t('Escriba una descripción efectiva de su negocio','Write an effective business description'),hint:t(`Al menos ${BIO_MIN} caracteres sobre lo que hace y dónde.`,`At least ${BIO_MIN} characters about what you do and where.`),done:d.profile.bio.trim().length>=BIO_MIN},
  {key:'photos',title:t('Suba 5 fotos de sus trabajos','Upload 5 photos of your work'),hint:t(`Tiene ${d.profile.photos.length} de ${PHOTOS_MIN}.`,`You have ${d.profile.photos.length} of ${PHOTOS_MIN}.`),done:d.profile.photos.length>=PHOTOS_MIN},
  {key:'services',title:t('Agregue los servicios que ofrece','Add the services you provide'),hint:t(`Tiene ${d.profile.services.length} servicios.`,`You have ${d.profile.services.length} services.`),done:d.profile.services.length>0},
  {key:'reviews',title:t('Consiga su primera reseña','Get your first review'),hint:t(`Reseñas publicadas: ${d.profile.rating.count??0}.`,`Published reviews: ${d.profile.rating.count??0}.`),done:(d.profile.rating.count??0)>0},
 ];
}
export function websiteChecks(d:InsightsSite,en:boolean){
 const t=(es:string,english:string)=>en?english:es,has=(type:string)=>!!d.site?.sections.some(s=>s.type===type&&s.enabled);
 return [
  {key:'published',title:t('Sitio publicado','Website published'),done:!!d.site?.published},
  {key:'form',title:t('Formulario de solicitud activo','Request form enabled'),done:has('contact')},
  {key:'portfolio',title:t('Casos de éxito con fotos','Success stories with photos'),done:has('portfolio')&&d.profile.photos.length>0},
  {key:'reviews',title:t('Reseñas visibles','Reviews shown'),done:has('reviews')},
  {key:'secure',title:t('Conexión segura (HTTPS)','Secure connection (HTTPS)'),done:true},
  {key:'mobile',title:t('Se adapta al celular','Mobile friendly'),done:true},
 ];
}
export const photoTips=(en:boolean)=>en?['Use natural light and take photos during the day.','Show the finished space from the entrance and from two corners.','Keep the camera level and horizontal, and tidy the space first.','Add a short caption with the service and the area.']:['Use luz natural y tome las fotos de día.','Muestre el espacio terminado desde la entrada y desde dos esquinas.','Mantenga la cámara nivelada y en horizontal, y ordene el espacio antes.','Agregue una descripción corta con el servicio y la zona.'];
