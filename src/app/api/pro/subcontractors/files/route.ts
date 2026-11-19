import {subCommentFilesGet,subCommentFilesPost} from '@/lib/pro/sub-comment-files-route';
/** Round 9: subcontractor comment attachments, owner side (through the role gate; the owner is the gate's account). SQL decides the scope. */
export const GET=(req:Request)=>subCommentFilesGet(req,true);
export const POST=(req:Request)=>subCommentFilesPost(req,true);
