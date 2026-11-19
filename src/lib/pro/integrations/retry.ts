/** Round 6A: deterministic retry backoff, mirror of SQL pro_integration_retry_delay: 30 s × 2^(n−1), at most 1 h. */
export const RETRY_BASE_SECONDS=30,RETRY_MAX_SECONDS=3600,RETRY_MAX_ATTEMPTS=8;
export function retryDelaySeconds(attempt:number){return Math.min(RETRY_BASE_SECONDS*2**(Math.max(1,Math.floor(attempt))-1),RETRY_MAX_SECONDS);}
export function nextAttemptAt(attempt:number,now=Date.now()){return new Date(now+retryDelaySeconds(attempt)*1000).toISOString();}
/** Transient failures worth a retry: network, timeout, 408, 425, 429 and 5xx. 4xx validation errors are final. */
export function isTransient(status:number|null){return status===null||status===0||status===408||status===425||status===429||status>=500;}
