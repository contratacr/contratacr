import {z} from 'zod';
/** Separate durable journal; shared owner lock is still requestPipelineWriteKey. */
export const leadOriginCreateWriteKey=(actor:string)=>'ccr:pro:lead-origin-create-write:v1:'+z.string().uuid().parse(actor);
