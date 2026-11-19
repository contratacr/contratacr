// LOCAL PRO ONLY (multivertical F2 extras): conservative normalizer for the OSM `website` / `contact:website` tag.
// Accepts only http(s) URLs with a real domain name. «www.example.com» (no scheme) becomes https://www.example.com;
// other scheme-less text («no», a business name) is rejected. Several values separated by «;» keep the first one.
// Rejected: other schemes (mailto:, javascript:, ftp:…), spaces, two URLs glued together, user:password@, explicit
// ports, IP addresses / localhost / single-label hosts, Facebook search pages and anything longer than 500
// characters. The fragment is dropped and a bare «/» path is removed. The result always satisfies the dir_places
// check (^https?://[^\s"<>]{3,}$, ≤ 500). Never throws.
const fail=reason=>({ok:false,reason});
const HOST=/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeWebsite(input){
 if(typeof input!=='string')return fail('empty');
 let text=input.trim();if(!text)return fail('empty');
 if(text.includes(';'))text=text.split(';')[0].trim();
 if(!text)return fail('empty');
 if(/\s/.test(text))return fail('whitespace');
 if((text.match(/https?:\/\//gi)??[]).length>1)return fail('several_urls');
 if(!/^[a-z][a-z0-9+.-]*:/i.test(text)){
  if(/^www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#]\S*)?$/i.test(text))text='https://'+text;else return fail('no_scheme');
 }
 let url;try{url=new URL(text);}catch{return fail('invalid_url');}
 if(url.protocol!=='http:'&&url.protocol!=='https:')return fail('scheme');
 if(url.username||url.password)return fail('credentials');
 if(url.port)return fail('port');
 if(!HOST.test(url.hostname))return fail('host');
 if(/(^|\.)facebook\.com$/.test(url.hostname)&&/^\/search(\/|$)/.test(url.pathname))return fail('search_page');
 url.hash='';
 let href=url.href;if(url.pathname==='/'&&!url.search)href=href.slice(0,-1);
 if(href.length>500)return fail('too_long');
 if(!/^https?:\/\/[^\s"<>]{3,}$/.test(href))return fail('invalid_url');
 return {ok:true,url:href};
}
