import {operationSchema} from './client-operations';

/** Exact request bytes survive a lost acknowledgement, scoped to one account/client. */
export type SavedClientAttempt={version:1;accountId:string;clientId:string;body:string;phase:'uncertain'|'confirmed';productName?:string};
type LocalStore=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export const clientOperationRecoveryKey=(accountId:string,clientId:string)=>`ccr:client-operation:v1:${encodeURIComponent(accountId)}:${encodeURIComponent(clientId)}`;

function validate(value:unknown,accountId:string,clientId:string):SavedClientAttempt{
 if(!value||typeof value!=='object')throw Error('Invalid recovery');
 const row=value as SavedClientAttempt;
 if(row.version!==1||row.accountId!==accountId||row.clientId!==clientId||typeof row.body!=='string'||row.body.length>16000||!['uncertain','confirmed'].includes(row.phase)||row.productName!==undefined&&(typeof row.productName!=='string'||row.productName.length>300))throw Error('Invalid recovery');
 const operation=operationSchema.parse(JSON.parse(row.body));
 if(operation.clientId!==clientId)throw Error('Invalid client');
 return row;
}
export function readClientAttempt(store:LocalStore,accountId:string,clientId:string):SavedClientAttempt|null{
 if(!accountId||!clientId)throw Error('Missing recovery scope');
 const raw=store.getItem(clientOperationRecoveryKey(accountId,clientId));
 if(raw===null)return null;
 if(raw.length>20000)throw Error('Invalid recovery');
 return validate(JSON.parse(raw),accountId,clientId);
}
export function saveClientAttempt(store:LocalStore,attempt:SavedClientAttempt){
 validate(attempt,attempt.accountId,attempt.clientId);
 const key=clientOperationRecoveryKey(attempt.accountId,attempt.clientId),previous=readClientAttempt(store,attempt.accountId,attempt.clientId);
 if(previous&&previous.body!==attempt.body)throw Error('Another unresolved operation');
 const raw=JSON.stringify(attempt);store.setItem(key,raw);
 if(store.getItem(key)!==raw)throw Error('Recovery was not retained');
}
export function clearClientAttempt(store:LocalStore,attempt:SavedClientAttempt){
 const key=clientOperationRecoveryKey(attempt.accountId,attempt.clientId),previous=readClientAttempt(store,attempt.accountId,attempt.clientId);
 if(previous&&previous.body!==attempt.body)throw Error('Another unresolved operation');
 store.removeItem(key);
 if(store.getItem(key)!==null)throw Error('Recovery was not cleared');
}
