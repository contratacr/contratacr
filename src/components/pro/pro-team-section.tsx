'use client';
import {TeamSpace} from './team-space';
import {CompanyTeamPanel} from './company-team';

/** Gaps round (2026-11-17): «Equipo» as a section of the Pro space (?tab=pro_team) and of the team page.
 * Company roles (members, roles, invitations, join) above the per-job collaborators, as before. */
export function ProTeamSection({accountId}:{accountId:string}){
 return <div data-pro-team-shell className="space-y-6"><CompanyTeamPanel proShell/><TeamSpace accountId={accountId} embedded/></div>;
}
