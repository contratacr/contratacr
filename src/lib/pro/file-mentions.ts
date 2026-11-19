import {z} from 'zod';
import {fileCommentCreateSchema,fileCommentSchema} from './file-versions';
/** Fila 30: @menciones del equipo en comentarios de archivos. Contract of docs/pro/sql/work-file-mentions-local.sql. */
export const FILE_MENTION_MAX=10,FILE_MENTION_EXCERPT_MAX=280;
const uuid=z.string().uuid(),stamp=z.string().datetime({offset:true}),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/),workId=z.string().trim().min(1).max(160);
export const fileMentionInputSchema=z.object({userId:uuid,grantId:uuid,sourceInviteId:uuid}).strict();
export const fileMentionTargetSchema=fileMentionInputSchema.extend({name:z.string().min(1).max(160)}).strict();
export const fileMentionTargetsSchema=z.object({workId,items:z.array(fileMentionTargetSchema).max(100)}).strict();
export const fileMentionSnapshotSchema=z.object({userId:uuid,name:z.string().min(1).max(160)}).strict();
/** comment_create of the team thread plus explicit, unique recipients. */
export const fileMentionCommentSchema=z.object({action:z.literal('comment_create'),actionId:uuid,workId,fileId:uuid,commentId:uuid,thread:z.literal('team'),
 versionNo:z.number().int().min(1).max(100).nullable(),body:z.string(),mentions:z.array(fileMentionInputSchema).min(1).max(FILE_MENTION_MAX)}).strict()
 .refine(value=>{const comment:Record<string,unknown>={...value};delete comment.mentions;return fileCommentCreateSchema.safeParse(comment).success;},'Comentario inválido.')
 .refine(value=>new Set(value.mentions.map(mention=>mention.userId)).size===value.mentions.length,'Mención repetida.');
export const fileMentionCommentResultSchema=z.object({comment:fileCommentSchema,mentions:z.array(fileMentionSnapshotSchema).min(1).max(FILE_MENTION_MAX)}).strict();
export const fileCommentMentionsSchema=z.object({workId,items:z.array(z.object({commentId:uuid,mentions:z.array(fileMentionSnapshotSchema).min(1).max(FILE_MENTION_MAX)}).strict()).max(20)}).strict();
export const fileMentionNoticeSchema=z.object({id:uuid,service:z.string().max(160),fileName:z.string().min(1).max(160),versionNo:z.number().int().min(1).max(100).nullable(),
 authorName:z.string().max(160),excerpt:z.string().min(1).max(FILE_MENTION_EXCERPT_MAX),createdAt:stamp,dayCr:day,readAt:stamp.nullable()}).strict();
export const fileMentionNoticesPageSchema=z.object({items:z.array(fileMentionNoticeSchema).max(20),nextCursor:uuid.nullable(),unreadCount:z.number().int().nonnegative()}).strict();
export const fileMentionNoticeMutationSchema=z.object({action:z.literal('mark_read'),actionId:uuid,noticeId:uuid}).strict();
export const fileMentionNoticeResultSchema=z.object({noticeId:uuid,readAt:stamp}).strict();
export const fileMentionMutationSchema=z.union([fileMentionCommentSchema,fileMentionNoticeMutationSchema]);
export type FileMentionTarget=z.infer<typeof fileMentionTargetSchema>;
export type FileMentionSnapshot=z.infer<typeof fileMentionSnapshotSchema>;
export type FileMentionNotice=z.infer<typeof fileMentionNoticeSchema>;
export type FileMentionNoticesPage=z.infer<typeof fileMentionNoticesPageSchema>;
/** Mentions that are still written in the text as "@"+name (case-insensitive), like the server check. */
export function mentionsInText<T extends {name:string}>(text:string,chosen:T[]){const lower=text.toLowerCase();return chosen.filter(person=>lower.includes('@'+person.name.toLowerCase()));}
/** Splits a body into plain text and "@name" segments for the recorded mentions (longest name first). */
export function mentionSegments(body:string,names:string[]):{text:string;mention:boolean}[]{
 const sorted=[...new Set(names.filter(Boolean))].sort((a,b)=>b.length-a.length);if(!sorted.length)return [{text:body,mention:false}];
 const out:{text:string;mention:boolean}[]=[],lower=body.toLowerCase();let index=0,plain='';
 while(index<body.length){
  const hit=body[index]==='@'?sorted.find(name=>lower.startsWith('@'+name.toLowerCase(),index)):undefined;
  if(hit){if(plain)out.push({text:plain,mention:false});plain='';out.push({text:body.slice(index,index+hit.length+1),mention:true});index+=hit.length+1;}
  else{plain+=body[index];index++;}
 }
 if(plain)out.push({text:plain,mention:false});return out;
}
