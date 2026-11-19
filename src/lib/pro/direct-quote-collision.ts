import {DirectQuoteWriteFailure,readDirectQuoteWrite,clearDirectQuoteWrite} from './direct-quote-write-recovery';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
/** Only an initial write known not to have reached transport may yield to another tab. */
export function recoverUnsentQuoteCollision({error,startedFresh,requestStarted,globalStore,tabStore,accountId,ownerKey}:{error:unknown;startedFresh:boolean;requestStarted:boolean;globalStore:Store;tabStore:Store;accountId:string;ownerKey:string}){
 if(!startedFresh||requestStarted||!(error instanceof DirectQuoteWriteFailure)||error.kind!=='storage'||error.attempt.phase!=='uncertain')return null;
 const other=readDirectQuoteWrite(globalStore,accountId);
 if(!other||other.body===error.attempt.body)return null;
 clearDirectQuoteWrite(tabStore,error.attempt);
 const raw=tabStore.getItem(ownerKey);
 if(raw){const marker=JSON.parse(raw);if(marker.accountId===accountId&&marker.body===error.attempt.body){tabStore.removeItem(ownerKey);if(tabStore.getItem(ownerKey)!==null)throw Error('Quote ownership was not cleared');}}
 return other;
}
