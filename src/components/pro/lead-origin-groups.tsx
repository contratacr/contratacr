import type {LeadOriginChannel} from '@/lib/pro/lead-origins';

/**
 * Lead sources grouped like a sales team thinks about them: Referral, Digital media, Traditional media and Other.
 * Built-in channels have a fixed group; custom channels and the rest go under Other. Presentation only: the stored
 * channel ids are unchanged.
 */
export type LeadSourceGroup='referral'|'digital'|'traditional'|'other';
export const leadSourceGroupOrder:LeadSourceGroup[]=['referral','digital','traditional','other'];
export const leadSourceGroupOf=(channel:LeadOriginChannel):LeadSourceGroup=>channel.id==='referral'?'referral':channel.id==='website'||channel.id==='social'?'digital':channel.id==='advertising'?'traditional':'other';
export const leadSourceGroupLabel=(group:LeadSourceGroup,en:boolean)=>({referral:en?'Referral':'Recomendación',digital:en?'Digital media':'Medios digitales',traditional:en?'Traditional media':'Medios tradicionales',other:en?'Other':'Otros'})[group];
export function LeadChannelOptions({channels,en,label}:{channels:LeadOriginChannel[];en:boolean;label:(channel:LeadOriginChannel)=>string}){
 return <>{leadSourceGroupOrder.map(group=>{const items=channels.filter(channel=>leadSourceGroupOf(channel)===group);return items.length?<optgroup key={group} label={leadSourceGroupLabel(group,en)} data-lead-source-group={group}>{items.map(channel=><option key={channel.id} value={channel.id}>{label(channel)}</option>)}</optgroup>:null;})}</>;
}
