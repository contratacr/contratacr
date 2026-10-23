import {proApiAccess} from '@/lib/pro/api-access';
export async function GET(req:Request){const access=await proApiAccess(req);if(access.error)return access.error;return Response.json({enabled:true},{headers:{'Cache-Control':'no-store'}});}
