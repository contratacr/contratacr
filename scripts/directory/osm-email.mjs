// LOCAL PRO ONLY (claim by e-mail, 2026-11-17): conservative normalizer for the OSM `email` / `contact:email` tag.
// The value becomes dir_places.email, the address that receives the one-time code of an email_listed claim (never
// shown in full on the public page). Several values separated by «;» or «,» keep the first one; «mailto:» is
// removed; the result is lower-cased and must satisfy the dir_places check
// (^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$, ≤ 254). Rejected: spaces inside, no «@», several «@», IP or
// single-label domains, reserved test domains (.test .invalid .example .localhost .local) and «noreply» boxes, which
// cannot receive a code. Never throws.
const fail=reason=>({ok:false,reason});
const SHAPE=/^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const RESERVED=/\.(test|invalid|example|localhost|local)$/;

export function normalizeOsmEmail(input){
 if(typeof input!=='string')return fail('empty');
 let text=input.trim();if(!text)return fail('empty');
 text=text.split(/[;,]/)[0].trim();if(!text)return fail('empty');
 text=text.replace(/^mailto:/i,'').trim().toLowerCase();
 if(/\s/.test(text))return fail('whitespace');
 const at=text.split('@');if(at.length!==2)return fail(at.length<2?'no_at':'several_at');
 const domain=at[1];
 if(/^\d+(\.\d+){3}$/.test(domain)||!domain.includes('.'))return fail('domain');
 if(RESERVED.test(domain))return fail('reserved');
 if(/^(no-?reply|do-?not-?reply)$/.test(at[0]))return fail('no_reply');
 if(text.length>254||!SHAPE.test(text))return fail('invalid');
 if(/\.\.|^\.|\.@|@-|-\.|\.-/.test(text))return fail('invalid');
 return {ok:true,email:text};
}
