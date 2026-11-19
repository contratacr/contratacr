import {servicePackageMutationSchema,servicePackageSchema} from './service-packages';
export type ServicePackageAck={id:string;revision:number};
export type ServicePackageRecovery={version:2;body:string;editing:string|null;ack:ServicePackageAck|null};
export const servicePackageRecoveryKey=(account:string)=>'contratacr:service-package-attempt:'+account;
export function parseServicePackageRecovery(value:unknown):ServicePackageRecovery{
 const r=value as ServicePackageRecovery;
 if(!r||Object.keys(r).some(key=>!['version','body','editing','ack'].includes(key))||r.version!==2||typeof r.body!=='string'||r.body.length>100000||!(r.ack===null||typeof r.ack==='object')||!(r.editing===null||typeof r.editing==='string'))throw Error('Invalid recovery record');
 const raw=JSON.parse(r.body),input=servicePackageMutationSchema.parse(raw);
 if(input.action==='save'&&r.editing!==null&&r.editing!==input.id||input.action!=='save'&&r.editing!==input.id)throw Error('Inconsistent recovery context');
 if(r.ack&&(Object.keys(r.ack).some(key=>!['id','revision'].includes(key))||r.ack.id!==input.id||!Number.isSafeInteger(r.ack.revision)||r.ack.revision!==input.revision+1))throw Error('Invalid acknowledgment');
 return {version:2,body:r.body,editing:r.editing,ack:r.ack};
}
export function readServicePackageRecovery(account:string){const raw=localStorage.getItem(servicePackageRecoveryKey(account));return raw===null?null:parseServicePackageRecovery(JSON.parse(raw));}
export function writeServicePackageRecovery(account:string,value:ServicePackageRecovery){
 const record=parseServicePackageRecovery(value),prior=readServicePackageRecovery(account);
 if(prior&&(prior.body!==record.body||prior.editing!==record.editing||prior.ack&&!record.ack))throw Error('Another recovery record exists');
 const serialized=JSON.stringify(record);localStorage.setItem(servicePackageRecoveryKey(account),serialized);
 if(localStorage.getItem(servicePackageRecoveryKey(account))!==serialized)throw Error('Recovery write not retained');
}
export function clearServicePackageRecovery(account:string,expectedBody:string){
 const prior=readServicePackageRecovery(account);if(prior&&prior.body!==expectedBody)throw Error('Recovery changed');
 localStorage.removeItem(servicePackageRecoveryKey(account));
 if(localStorage.getItem(servicePackageRecoveryKey(account))!==null)throw Error('Recovery removal failed');
}

export function verifyServicePackageCanonical(record:ServicePackageRecovery,page:unknown):boolean{
 const receipt=parseServicePackageRecovery(record),input=servicePackageMutationSchema.parse(JSON.parse(receipt.body));
 if(!receipt.ack)throw Error('Missing acknowledgment');
 const result=page as {revision:number;items:Array<{id:string;archived:boolean;name:string;notes:string;lines:unknown}>};
 if(!result||!Number.isSafeInteger(result.revision)||result.revision<receipt.ack.revision||!Array.isArray(result.items))throw Error('Stale canonical read');
 const found=result.items.find(row=>row.id===input.id);
 if(!found||typeof found.archived!=='boolean')throw Error('Missing canonical target');
 const content=servicePackageSchema.parse({name:found.name,notes:found.notes,lines:found.lines});
 const newer=result.revision>receipt.ack.revision;
 if(!newer&&(input.action==='archive'&&!found.archived||input.action==='restore'&&found.archived||input.action==='save'&&JSON.stringify(content)!==JSON.stringify(input.package)))throw Error('Canonical mismatch');
 return newer;
}
