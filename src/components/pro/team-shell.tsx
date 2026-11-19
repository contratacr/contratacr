'use client';

import {useEffect} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {setProNavigationAccount} from '@/lib/pro/navigation';
import {useLocalProAccess} from './use-local-pro-access';
import {ProFrame,proSectionLabels} from './pro-space';
import {ProTeamSection} from './pro-team-section';
import {TeamSpace} from './team-space';
import {CompanyTeamPanel} from './company-team';

/** Round 7B (walkthrough 89): «Equipo» stays inside the Pro shell (same header and
 * side menu) for an account with Pro. A collaborator without a Pro plan keeps the
 * plain team page: membership is still checked by the scoped team API. */
export function TeamShell({accountId}:{accountId:string}){
 const en=useLocale()==='en',{user,loading}=useAuth(),access=useLocalProAccess(user?.id);
 useEffect(()=>{setProNavigationAccount(user?.id??null);return()=>setProNavigationAccount(null);},[user?.id]);
 // Round 7C: company roles (members, roles, invitations, join) above the per-job collaborators.
 const space=<TeamSpace accountId={accountId} top={<CompanyTeamPanel/>}/>;
 // Wait for the session and the access check so the team screen mounts once (never re-parented).
 // Fix 13: while the session loads, show a visible loading state instead of an empty frame.
 if(loading)return <p role="status" aria-busy="true" className="p-6">{en?'Loading team…':'Cargando equipo…'}</p>;
 if(user&&user.id===accountId&&!access.ready&&!access.error)return <p role="status" aria-busy="true" className="p-6">{en?'Loading team…':'Cargando equipo…'}</p>;
 if(!user||user.id!==accountId||!access.enabled)return space;
 // Gaps round (2026-11-17): same Pro chrome as every other section (no «Volver a Pro», no second header).
 return <ProFrame tab="pro_team" labels={proSectionLabels(en)} navigating={false}><ProTeamSection accountId={accountId}/></ProFrame>;
}
