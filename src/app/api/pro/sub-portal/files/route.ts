import {subCommentFilesGet,subCommentFilesPost} from '@/lib/pro/sub-comment-files-route';
/** Round 9: subcontractor comment attachments (subcontractor side, outside the substitution: real identity). SQL decides the scope. */
export const GET=(req:Request)=>subCommentFilesGet(req,false);
export const POST=(req:Request)=>subCommentFilesPost(req,false);
