/**
 * Round 6D (row 69): custom domain for a professional's website — DOCUMENTED adapter, not active.
 * Cloudflare for SaaS «custom hostnames»: POST /zones/{zone_id}/custom_hostnames {hostname, ssl:{method:'http',type:'dv'}}
 * then the customer points a CNAME of their domain to the configured target; the status is polled with
 * GET /zones/{zone_id}/custom_hostnames?hostname=…. Requires PRO_CLOUDFLARE_ZONE_ID + PRO_CLOUDFLARE_API_TOKEN
 * (scope: SSL and Certificates edit on that zone only). Locally the site is only served at /sitio/<slug>.
 */
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
export class CloudflareCustomHostnames{
 constructor(private zoneId:string,private token:string,private fetcher:Fetcher=fetch){}
 createRequest(hostname:string){return {url:`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(this.zoneId)}/custom_hostnames`,init:{method:'POST',headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json'},body:JSON.stringify({hostname,ssl:{method:'http',type:'dv'}})} satisfies RequestInit};}
 async create(hostname:string){const {url,init}=this.createRequest(hostname);const response=await this.fetcher(url,init);return {ok:response.ok,status:response.status};}
}
