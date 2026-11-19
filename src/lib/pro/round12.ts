import {z} from 'zod';

/**
 * Round 12: customer project overview (pro_client_project_overview). Built only from the existing
 * customer readers, so a section the professional keeps hidden arrives as null. Strict: an
 * unexpected key fails parsing instead of reaching the customer's screen.
 */
const cents=z.number().int().safe(),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/),stamp=z.string().min(1).max(64);
export const clientOverviewApprovalSchema=z.object({kind:z.enum(['quote','contract','selection','change','payment_plan']),id:z.string().min(1).max(160),title:z.string().max(400).nullable().optional(),
 amountCents:cents.nullable().optional(),currency:z.enum(['CRC','USD']).nullable().optional(),code:z.string().max(40).nullable().optional(),area:z.string().max(300).nullable().optional(),date:z.string().max(64).nullable().optional(),overdue:z.boolean().optional()}).strict();
export const clientProjectOverviewSchema=z.discriminatedUnion('visible',[
 z.object({visible:z.literal(false)}).strict(),
 z.object({visible:z.literal(true),requestId:z.string().uuid(),today:day,workTitle:z.string().max(400),professionalName:z.string().max(300).nullable(),
  stage:z.string().max(40),nextVisit:z.string().max(64).nullable(),
  approvals:z.array(clientOverviewApprovalSchema).max(500),
  finances:z.object({agreedCents:cents.nullable(),paidCents:cents,balanceCents:cents.nullable(),invoicedCents:cents}).strict().nullable(),
  installments:z.object({remainingCents:cents,overdueCount:z.number().int().min(0),overdueCents:cents,next:z.object({dueDate:day,amountCents:cents,status:z.enum(['pending','partial','overdue'])}).strict().nullable()}).strict().nullable(),
  schedule:z.object({nextMilestone:z.object({title:z.string().max(300),date:day}).strict().nullable(),total:z.number().int().min(0),done:z.number().int().min(0),plannedEnd:day.nullable()}).strict().nullable(),
  messages:z.object({unread:z.number().int().min(0),last:z.object({side:z.enum(['pro','client']),body:z.string().max(200),createdAt:stamp}).strict().nullable()}).strict().nullable(),
  files:z.object({items:z.array(z.object({id:z.string().uuid(),name:z.string().max(300),mimeType:z.string().max(200),publishedAt:stamp.nullable()}).strict()).max(3),more:z.boolean()}).strict().nullable(),
 }).strict(),
]);
export type ClientProjectOverview=z.infer<typeof clientProjectOverviewSchema>;
/** Anchors of the customer project sections (client-work-sections.tsx), used by the overview links. */
/** Fix 13: the overview asks a collapsed section (messages) to open when it jumps to it. */
export const CLIENT_SECTION_OPEN_EVENT='ccr-client-section-open';
export const clientSectionAnchor=(requestId:string,section:string)=>`cliente-${section}-${requestId.slice(0,8)}`;

/** Round 12 (row 61): starting layouts for a new mood board (own ContrataCR wording and colours). The first page
 * is saved through the existing page writer; every element stays editable (move, resize, delete). */
export const moodTemplates=['kitchen','bathroom','living','palette'] as const;
export type MoodTemplate=typeof moodTemplates[number];
export function moodTemplateLabel(template:MoodTemplate|'none',en:boolean){return ({none:en?'Blank board':'Tablero en blanco',kitchen:en?'Kitchen':'Cocina',bathroom:en?'Bathroom':'Baño',living:en?'Living room':'Sala',palette:en?'Materials palette':'Paleta de materiales'})[template];}
type TemplateElement={kind:'text';id:string;x:number;y:number;w:number;h:number;rotation:0;text:string;color:string}|{kind:'swatch';id:string;x:number;y:number;w:number;h:number;rotation:0;color:string;label:string}|{kind:'note';id:string;x:number;y:number;w:number;h:number;rotation:0;text:string}|{kind:'arrow';id:string;x:number;y:number;w:number;h:number;rotation:0;color:string;points:[[number,number],[number,number]]};
export function moodTemplateElements(template:MoodTemplate,en:boolean,id:()=>string=()=>crypto.randomUUID()):TemplateElement[]{
 const l=(es:string,english:string)=>en?english:es;
 const title=(text:string):TemplateElement=>({kind:'text',id:id(),x:400,y:300,w:6000,h:900,rotation:0,text,color:'#162543'});
 const swatches=(items:[string,string][]):TemplateElement[]=>items.map(([color,label],i)=>({kind:'swatch',id:id(),x:400+i*2300,y:1500,w:2000,h:2600,rotation:0,color,label}));
 const notes=(items:string[]):TemplateElement[]=>items.map((text,i)=>({kind:'note',id:id(),x:400+i*3200,y:5000,w:2900,h:2200,rotation:0,text}));
 const arrow:TemplateElement={kind:'arrow',id:id(),x:6800,y:7600,w:2600,h:900,rotation:0,color:'#008bb5',points:[[0,800],[1000,200]]};
 if(template==='kitchen')return [title(l('Cocina: ideas y materiales','Kitchen: ideas and materials')),...swatches([['#f4efe6',l('Gabinetes','Cabinets')],['#3b3b3b',l('Encimera','Countertop')],['#d9e4ec',l('Pared','Wall')],['#b08d57',l('Herrajes','Hardware')]]),...notes([l('Agregue fotos de referencia','Add reference photos'),l('Electrodomésticos elegidos','Chosen appliances'),l('Iluminación y tomacorrientes','Lighting and outlets')]),arrow];
 if(template==='bathroom')return [title(l('Baño: acabados','Bathroom: finishes')),...swatches([['#ffffff',l('Sanitarios','Fixtures')],['#c9c3b8',l('Piso','Floor')],['#8fa9b8',l('Azulejo de ducha','Shower tile')],['#9a9a9a',l('Grifería','Faucets')]]),...notes([l('Mueble de lavamanos','Vanity'),l('Espejo y luz','Mirror and light'),l('Accesorios','Accessories')]),arrow];
 if(template==='living')return [title(l('Sala: estilo','Living room: style')),...swatches([['#e8dfd0',l('Paredes','Walls')],['#6b4f3a',l('Madera','Wood')],['#2f4858',l('Textiles','Textiles')],['#d4a373',l('Acento','Accent')]]),...notes([l('Muebles principales','Main furniture'),l('Cortinas y alfombras','Curtains and rugs'),l('Iluminación','Lighting')]),arrow];
 return [title(l('Paleta de materiales','Materials palette')),...swatches([['#f2f2f2',l('Base','Base')],['#c8b8a6',l('Neutro','Neutral')],['#556b2f',l('Natural','Natural')],['#1f3b57',l('Contraste','Contrast')]]),...notes([l('Dónde va cada color','Where each colour goes'),l('Proveedor y código','Supplier and code'),l('Pendiente de aprobar','Pending approval')])];
}
