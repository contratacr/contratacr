/**
 * Pro 29 (row 69): custom-domain adapter interface. Only the mock is active: it hands out the DNS instructions and
 * simulates the verification; no DNS lookup, no provider call, nothing is served on the domain. The Cloudflare for SaaS
 * class (cloudflare.ts) is the documented real implementation and is never selected here.
 */
export type DnsInstructions={cnameTarget:string;txtName:string;txtValue:string};
export interface CustomDomainProvider{readonly mode:'mock'|'sandbox'|'production';instructions(hostname:string,token:string):DnsInstructions;check(hostname:string):Promise<{verified:boolean}>}
export const DEFAULT_CNAME_TARGET='sitios.contratacr.com';
export const cnameTarget=()=>{const value=(process.env.PRO_SITE_CNAME_TARGET??'').trim().toLowerCase();return /^([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/.test(value)?value:DEFAULT_CNAME_TARGET;};
export class MockCustomDomain implements CustomDomainProvider{
 readonly mode='mock' as const;
 constructor(private target=cnameTarget()){}
 instructions(hostname:string,token:string):DnsInstructions{return {cnameTarget:this.target,txtName:'_contratacr-verify.'+hostname,txtValue:'contratacr-verify='+token};}
 async check(){return {verified:true};}
}
export const domainProviderFor=(mode:'mock'|'sandbox'|'production'):CustomDomainProvider|null=>mode==='mock'?new MockCustomDomain():null;
/** Hostname to register: public name, not an IP, not ours. */
export const hostnameOk=(value:string)=>value.length<=253&&/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(value)&&!/(^|\.)contratacr\.com$/.test(value);
