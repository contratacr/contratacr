import {z} from 'zod';
import {taskDueDate} from './work-tasks';
const id=z.string().uuid(),workId=z.string().min(1).max(160),stamp=z.string().datetime({offset:true}),inputRevision=z.number().int().positive().max(2147483646),revision=z.number().int().positive().max(2147483647);
export const teamRoleSchema=z.enum(['viewer','contributor']);
export const teamCodeSchema=z.string().trim().regex(/^[a-fA-F0-9]{64}$/).transform(value=>value.toLowerCase());
export const teamAssignmentSchema=z.object({grantId:id,name:z.string().max(160),active:z.boolean()}).strict();
export const teamMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('invite'),actionId:id,workId,role:teamRoleSchema,email:z.string().trim().toLowerCase().email().max(254),code:teamCodeSchema}).strict(),
 z.object({action:z.literal('accept'),actionId:id,code:teamCodeSchema}).strict(),
 z.object({action:z.literal('cancel_invite'),actionId:id,workId,inviteId:id,revision:inputRevision}).strict(),
 z.object({action:z.literal('set_role'),actionId:id,workId,grantId:id,revision:inputRevision,role:teamRoleSchema}).strict(),
 z.object({action:z.literal('revoke'),actionId:id,workId,grantId:id,revision:inputRevision}).strict(),
 z.object({action:z.literal('assign'),actionId:id,workId,taskId:id,revision:inputRevision,assigneeGrantId:id.nullable()}).strict(),
 z.object({action:z.literal('comment'),actionId:id,grantId:id,text:z.string().trim().min(1).max(1000)}).strict(),
 z.object({action:z.enum(['complete','reopen']),actionId:id,grantId:id,taskId:id,revision:inputRevision}).strict(),
]);
export type TeamMutation=z.infer<typeof teamMutationSchema>;
export const teamInviteSchema=z.object({id,ownerId:id,workId,email:z.string().email().max(254),role:teamRoleSchema,status:z.enum(['pending','accepted','revoked','expired']),revision,createdAt:stamp,expiresAt:stamp}).strict();
export type TeamInvite=z.infer<typeof teamInviteSchema>;
export const teamGrantSchema=z.object({id,ownerId:id,workId,userId:id,displayName:z.string().max(160),role:teamRoleSchema,active:z.boolean(),revision,canAssign:z.boolean().default(false)}).strict();
export type TeamGrant=z.infer<typeof teamGrantSchema>;
export const teamSharedGrantSchema=z.object({id,workId,role:teamRoleSchema,revision,ownerId:id,ownerName:z.string().max(160),service:z.string().max(160),stage:z.enum(['new','quoting','scheduled','completed']),cancelled:z.boolean(),canContribute:z.boolean()}).strict();
export type TeamSharedGrant=z.infer<typeof teamSharedGrantSchema>;
export const teamSharedTaskSchema=z.object({id,title:z.string().min(1).max(160),dueDate:taskDueDate,status:z.enum(['open','done']),revision,assignment:teamAssignmentSchema.nullable().default(null)}).strict();
export const teamTaskSchema=teamSharedTaskSchema;
export type TeamSharedTask=z.infer<typeof teamSharedTaskSchema>;
export const teamCommentSchema=z.object({id,actorId:id,actorName:z.string().max(160),text:z.string().min(1).max(1000),at:stamp}).strict();
export type TeamComment=z.infer<typeof teamCommentSchema>;
export const teamResultSchema=z.discriminatedUnion('action',[
 z.object({action:z.enum(['invite','cancel_invite']),ownerId:id,workId,invite:teamInviteSchema}).strict(),
 z.object({action:z.enum(['accept','set_role','revoke']),ownerId:id,workId,grant:teamGrantSchema}).strict(),
 z.object({action:z.literal('comment'),ownerId:id,workId,comment:teamCommentSchema}).strict(),
 z.object({action:z.enum(['complete','reopen','assign']),ownerId:id,workId,task:teamSharedTaskSchema}).strict(),
]).superRefine((value,context)=>{const payload='invite'in value?value.invite:'grant'in value?value.grant:null;if(payload&&(payload.ownerId!==value.ownerId||payload.workId!==value.workId))context.addIssue({code:'custom',message:'Invalid team result scope.'});});
export type TeamResult=z.infer<typeof teamResultSchema>;
export const teamInvitesPageSchema=z.object({workId,items:z.array(teamInviteSchema).max(20),nextCursor:id.nullable()}).strict();
export const teamMembersPageSchema=z.object({workId,items:z.array(teamGrantSchema).max(20),nextCursor:id.nullable()}).strict();
export const teamSharedPageSchema=z.object({items:z.array(teamSharedGrantSchema).max(20),nextCursor:id.nullable(),canManage:z.boolean()}).strict();
export const teamTasksPageSchema=z.object({grant:teamSharedGrantSchema,items:z.array(teamSharedTaskSchema).max(20),nextCursor:id.nullable()}).strict();
export const teamCommentsPageSchema=z.object({grant:teamSharedGrantSchema,items:z.array(teamCommentSchema).max(20),nextCursor:id.nullable()}).strict();
export const teamAuditEventSchema=z.object({id,actionId:id,actorId:id,actorName:z.string().max(160),action:z.enum(['invite','accept','cancel_invite','set_role','revoke','comment','complete','reopen','assign']),at:stamp,taskId:id.nullable(),title:z.string().max(160).nullable(),grantId:id.nullable(),role:teamRoleSchema.nullable(),assignmentBefore:teamAssignmentSchema.nullable().default(null),assignmentAfter:teamAssignmentSchema.nullable().default(null)}).strict();
export const teamAuditPageSchema=z.object({workId,items:z.array(teamAuditEventSchema).max(20),nextCursor:id.nullable()}).strict();
export type TeamInvitesPage=z.infer<typeof teamInvitesPageSchema>;
export type TeamMembersPage=z.infer<typeof teamMembersPageSchema>;
export type TeamSharedPage=z.infer<typeof teamSharedPageSchema>;
export type TeamTasksPage=z.infer<typeof teamTasksPageSchema>;
export type TeamCommentsPage=z.infer<typeof teamCommentsPageSchema>;
export type TeamAuditPage=z.infer<typeof teamAuditPageSchema>;
export const teamOwnedWorkSchema=z.object({id:workId,service:z.string().max(160),stage:z.enum(['new','quoting','scheduled','completed']),cancelled:z.boolean(),start:z.string()}).strict();
export const teamOwnedPageSchema=z.object({items:z.array(teamOwnedWorkSchema).max(20),nextCursor:workId.nullable()}).strict();
export type TeamOwnedPage=z.infer<typeof teamOwnedPageSchema>;
