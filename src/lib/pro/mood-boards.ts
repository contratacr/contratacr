import {z} from 'zod';

/**
 * Tableros de ideas por proyecto (parity register row 61). Per job: boards with
 * fixed-size pages and elements (image, item of My items, color swatch, note).
 * Geometry is normalized to integer ten-thousandths of the page so a board looks
 * the same at any screen width; the database validates every value again.
 * Images reuse the private job files. Nothing here charges, invoices or notifies.
 */
export const MOOD_COORD_MAX=10000;
export const MOOD_MIN_SIZE=200;
export const MOOD_MAX_ELEMENTS=60;
export const MOOD_MAX_PAGES=20;
export const MOOD_MAX_BOARDS=50;
export const MOOD_NAME_MAX=80;
export const MOOD_PAGE_NAME_MAX=60;
export const MOOD_NOTE_MAX=280;
export const MOOD_LABEL_MAX=60;
export const MOOD_COMMENT_MAX=1000;
/** The route rejects larger bodies (413); the editor checks before sending. */
// Round 7C: drawings and arrows carry points, so a page body may be larger (still bounded).
export const MOOD_BODY_MAX=65536;
export const MOOD_POINTS_MAX=120;
export const moodPageFormats=['wide','a4','standard','letter','tabloid','a3'] as const;
export type MoodPageFormat=(typeof moodPageFormats)[number];
/** Height / width of each page format: 16:9, 4:3, A4, A3, US Letter and US Tabloid, all landscape. */
export const moodPageRatio:Record<MoodPageFormat,number>={wide:9/16,a4:210/297,standard:3/4,letter:8.5/11,tabloid:11/17,a3:297/420};
export const moodRotations=[0,90,180,270] as const;
export type MoodRotation=(typeof moodRotations)[number];

const uuid=z.string().uuid(),workId=z.string().trim().min(1).max(160),stamp=z.string().datetime({offset:true});
const revision=z.number().int().positive().max(2147483646);
const coord=z.number().int().min(0).max(MOOD_COORD_MAX);
const size=z.number().int().min(MOOD_MIN_SIZE).max(MOOD_COORD_MAX);
const rotation=z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)]);
export const moodHexSchema=z.string().regex(/^#[0-9a-f]{6}$/);
const text=(max:number)=>z.string().trim().min(1).max(max);
const cents=z.number().int().min(0).max(10000000000);
const productId=z.string().min(1).max(160);
const geometry={id:uuid,x:coord,y:coord,w:size,h:size,rotation};
// Round 7C: free text, arrows and freehand drawing. Points are relative to the element box (0..1000).
const point=z.tuple([z.number().int().min(0).max(1000),z.number().int().min(0).max(1000)]);
const strokes={text:z.object({kind:z.literal('text'),...geometry,text:text(MOOD_NOTE_MAX),color:moodHexSchema}).strict(),arrow:z.object({kind:z.literal('arrow'),...geometry,color:moodHexSchema,points:z.array(point).length(2)}).strict(),drawing:z.object({kind:z.literal('drawing'),...geometry,color:moodHexSchema,points:z.array(point).min(2).max(MOOD_POINTS_MAX)}).strict()};
const inside=(value:{x:number;y:number;w:number;h:number})=>value.x+value.w<=MOOD_COORD_MAX&&value.y+value.h<=MOOD_COORD_MAX;

/** What the editor sends for one element (exact keys, like the database). */
export const moodElementInputSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('image'),...geometry,fileId:uuid}).strict(),
 z.object({kind:z.literal('product'),...geometry,productId,fileId:uuid.nullable(),showPrice:z.boolean()}).strict(),
 z.object({kind:z.literal('swatch'),...geometry,color:moodHexSchema,label:z.string().trim().max(MOOD_LABEL_MAX).nullable()}).strict(),
 z.object({kind:z.literal('note'),...geometry,text:text(MOOD_NOTE_MAX)}).strict(),
 strokes.text,strokes.arrow,strokes.drawing,
]).refine(inside,'Element outside the page.');
export type MoodElementInput=z.infer<typeof moodElementInputSchema>;

/** Stored element: items carry the name, unit and price captured when placed. */
const snapshot={name:z.string().min(1).max(160),unit:z.string().min(1).max(40).nullable(),priceCents:cents};
export const moodElementSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('image'),...geometry,fileId:uuid}).strict(),
 z.object({kind:z.literal('product'),...geometry,productId,fileId:uuid.nullable(),showPrice:z.boolean(),...snapshot}).strict(),
 z.object({kind:z.literal('swatch'),...geometry,color:moodHexSchema,label:z.string().min(1).max(MOOD_LABEL_MAX).nullable()}).strict(),
 z.object({kind:z.literal('note'),...geometry,text:z.string().min(1).max(MOOD_NOTE_MAX)}).strict(),
 strokes.text,strokes.arrow,strokes.drawing,
]);
export type MoodElement=z.infer<typeof moodElementSchema>;
/** A product placed in this session has no snapshot yet: the server fills it on save. */
export type MoodDraftElement=MoodElement|(Extract<MoodElementInput,{kind:'product'}>&{name:string;unit:string|null;priceCents:number});

/** Drop the server snapshot fields before saving (the database rejects unknown keys). */
export function moodElementInput(element:MoodDraftElement):MoodElementInput{
 const base={id:element.id,x:element.x,y:element.y,w:element.w,h:element.h,rotation:element.rotation};
 switch(element.kind){
  case 'image':return {kind:'image',...base,fileId:element.fileId};
  case 'product':return {kind:'product',...base,productId:element.productId,fileId:element.fileId,showPrice:element.showPrice};
  case 'swatch':return {kind:'swatch',...base,color:element.color,label:element.label?.trim()||null};
  case 'text':return {kind:'text',...base,text:element.text.trim(),color:element.color};
  case 'arrow':return {kind:'arrow',...base,color:element.color,points:element.points};
  case 'drawing':return {kind:'drawing',...base,color:element.color,points:element.points};
  default:return {kind:'note',...base,text:element.text.trim()};
 }
}

/** Keep a box inside the page with the minimum size, using integers only. */
export function clampBox(box:{x:number;y:number;w:number;h:number}){
 const w=Math.round(Math.min(MOOD_COORD_MAX,Math.max(MOOD_MIN_SIZE,box.w))),h=Math.round(Math.min(MOOD_COORD_MAX,Math.max(MOOD_MIN_SIZE,box.h)));
 const x=Math.round(Math.min(MOOD_COORD_MAX-w,Math.max(0,box.x))),y=Math.round(Math.min(MOOD_COORD_MAX-h,Math.max(0,box.y)));
 return {x,y,w,h};
}
export const nextRotation=(value:MoodRotation):MoodRotation=>((value+90)%360) as MoodRotation;

export const moodPageSchema=z.object({
 id:uuid,boardId:uuid,sortOrder:z.number().int().min(0).max(MOOD_MAX_PAGES-1),name:z.string().min(1).max(MOOD_PAGE_NAME_MAX).nullable(),
 background:moodHexSchema,elements:z.array(moodElementSchema).max(MOOD_MAX_ELEMENTS),revision:z.number().int().positive(),updatedAt:stamp,
}).strict();
export type MoodPage=z.infer<typeof moodPageSchema>;
export const moodBoardSchema=z.object({
 id:uuid,workId,position:z.number().int().positive(),name:z.string().min(1).max(MOOD_NAME_MAX),room:z.string().min(1).max(MOOD_NAME_MAX).nullable(),
 pageFormat:z.enum(moodPageFormats),archived:z.boolean(),publishedVersion:z.number().int().min(1).max(100).nullable(),publishedAt:stamp.nullable(),
 pageCount:z.number().int().min(1).max(MOOD_MAX_PAGES),cover:z.object({background:moodHexSchema,elements:z.array(moodElementSchema).max(MOOD_MAX_ELEMENTS)}).strict().nullable(),
 commentCount:z.number().int().min(0),clientCommentCount:z.number().int().min(0),lastCommentAt:stamp.nullable(),
 revision:z.number().int().positive(),createdAt:stamp,updatedAt:stamp,
}).strict();
export type MoodBoard=z.infer<typeof moodBoardSchema>;
export const moodBoardListSchema=z.object({
 workId,archived:z.boolean(),clientVisible:z.boolean(),recipientName:z.string().min(1).max(160).nullable(),
 counts:z.object({active:z.number().int().min(0),archived:z.number().int().min(0)}).strict(),items:z.array(moodBoardSchema).max(500),
}).strict();
export type MoodBoardList=z.infer<typeof moodBoardListSchema>;
export const moodCommentSchema=z.object({
 id:uuid,boardId:uuid,version:z.number().int().min(1).max(100),side:z.enum(['owner','client']),authorName:z.string().min(1).max(160).nullable(),
 body:z.string().min(1).max(MOOD_COMMENT_MAX),createdAt:stamp,
}).strict();
export type MoodComment=z.infer<typeof moodCommentSchema>;
const historyActions=['board_create','board_update','board_duplicate','board_archive','board_restore','page_add','page_reorder','page_delete','page_save','publish','unpublish','comment'] as const;
export const moodHistorySchema=z.object({actionId:uuid,side:z.enum(['owner','client']),action:z.enum(historyActions),targetKind:z.enum(['board','page','comment']),targetId:uuid,at:stamp}).strict();
export type MoodHistoryEntry=z.infer<typeof moodHistorySchema>;
export const moodBoardDetailSchema=z.object({
 board:moodBoardSchema,pages:z.array(moodPageSchema).min(1).max(MOOD_MAX_PAGES),
 publications:z.array(z.object({id:uuid,version:z.number().int().min(1).max(100),publishedAt:stamp,pageCount:z.number().int().min(1).max(MOOD_MAX_PAGES)}).strict()).max(100),
 comments:z.array(moodCommentSchema).max(300),history:z.array(moodHistorySchema).max(50),clientVisible:z.boolean(),
}).strict();
export type MoodBoardDetail=z.infer<typeof moodBoardDetailSchema>;
export const moodProductSchema=z.object({id:productId,name:z.string().min(1).max(160),sku:z.string().min(1).max(80).nullable(),unit:z.string().min(1).max(40).nullable(),category:z.string().min(1).max(80).nullable(),priceCents:cents}).strict();
export type MoodProduct=z.infer<typeof moodProductSchema>;
export const moodProductsSchema=z.object({items:z.array(moodProductSchema).max(30)}).strict();

const target={actionId:uuid,workId,id:uuid};
const boardFields={name:text(MOOD_NAME_MAX),room:z.string().trim().max(MOOD_NAME_MAX).nullable(),pageFormat:z.enum(moodPageFormats)};
export const moodBoardMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('board_create'),...target,pageId:uuid,...boardFields}).strict(),
 z.object({action:z.literal('board_update'),...target,revision,...boardFields}).strict(),
 z.object({action:z.literal('board_duplicate'),...target,newId:uuid,name:text(MOOD_NAME_MAX)}).strict(),
 z.object({action:z.enum(['board_archive','board_restore','publish','unpublish']),...target,revision}).strict(),
 z.object({action:z.enum(['page_add','page_delete']),...target,revision,pageId:uuid}).strict(),
 z.object({action:z.literal('page_reorder'),...target,revision,pageIds:z.array(uuid).min(1).max(MOOD_MAX_PAGES)}).strict(),
 z.object({action:z.literal('page_save'),...target,revision,pageId:uuid,name:z.string().trim().max(MOOD_PAGE_NAME_MAX).nullable(),background:moodHexSchema,elements:z.array(moodElementInputSchema).max(MOOD_MAX_ELEMENTS)}).strict(),
 z.object({action:z.literal('comment'),...target,commentId:uuid,body:text(MOOD_COMMENT_MAX)}).strict(),
]).superRefine((value,context)=>{
 if(value.action==='page_reorder'&&new Set(value.pageIds).size!==value.pageIds.length)context.addIssue({code:'custom',message:'Repeated page.'});
 if(value.action==='page_save'&&new Set(value.elements.map(element=>element.id)).size!==value.elements.length)context.addIssue({code:'custom',message:'Repeated element.'});
});
export type MoodBoardMutation=z.infer<typeof moodBoardMutationSchema>;
export const moodBoardResultSchema=z.union([
 z.object({board:moodBoardSchema,pages:z.array(moodPageSchema).min(1).max(MOOD_MAX_PAGES)}).strict(),
 z.object({board:moodBoardSchema,page:moodPageSchema}).strict(),
 z.object({comment:moodCommentSchema}).strict(),
]);

export const moodClientMutationSchema=z.object({action:z.literal('comment'),actionId:uuid,requestId:uuid,boardId:uuid,commentId:uuid,version:z.number().int().min(1).max(100),body:text(MOOD_COMMENT_MAX)}).strict();
export type MoodClientMutation=z.infer<typeof moodClientMutationSchema>;
export const moodClientResultSchema=z.object({comment:moodCommentSchema}).strict();

/** Customer copy of a published snapshot: no file ids, item ids or hidden prices. */
export const moodClientElementSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('image'),...geometry,hasImage:z.literal(true)}).strict(),
 z.object({kind:z.literal('product'),...geometry,hasImage:z.boolean(),name:z.string().min(1).max(160),unit:z.string().min(1).max(40).nullable(),priceCents:cents.nullable()}).strict(),
 z.object({kind:z.literal('swatch'),...geometry,color:moodHexSchema,label:z.string().min(1).max(MOOD_LABEL_MAX).nullable()}).strict(),
 z.object({kind:z.literal('note'),...geometry,text:z.string().min(1).max(MOOD_NOTE_MAX)}).strict(),
 strokes.text,strokes.arrow,strokes.drawing,
]);
export type MoodClientElement=z.infer<typeof moodClientElementSchema>;
export const moodClientBoardSchema=z.object({
 id:uuid,publicationId:uuid,version:z.number().int().min(1).max(100),publishedAt:stamp,name:z.string().min(1).max(MOOD_NAME_MAX),room:z.string().min(1).max(MOOD_NAME_MAX).nullable(),
 pageFormat:z.enum(moodPageFormats),pages:z.array(z.object({id:uuid,name:z.string().min(1).max(MOOD_PAGE_NAME_MAX).nullable(),background:moodHexSchema,elements:z.array(moodClientElementSchema).max(MOOD_MAX_ELEMENTS)}).strict()).min(1).max(MOOD_MAX_PAGES),
 comments:z.array(moodCommentSchema).max(300),
}).strict();
export type MoodClientBoard=z.infer<typeof moodClientBoardSchema>;
export const moodClientViewSchema=z.union([
 z.object({visible:z.literal(false)}).strict(),
 z.object({visible:z.literal(true),boards:z.array(moodClientBoardSchema).max(50)}).strict(),
]);
export type MoodClientView=z.infer<typeof moodClientViewSchema>;

/** Image URLs: owner (job file) or customer (element of the published snapshot). */
export const moodOwnerImageUrl=(fileId:string)=>'/api/pro/mood-boards?'+new URLSearchParams({image:fileId});
export const moodClientImageUrl=(publicationId:string,pageId:string,elementId:string)=>'/api/pro/mood-boards?'+new URLSearchParams({publication:publicationId,page:pageId,element:elementId});
