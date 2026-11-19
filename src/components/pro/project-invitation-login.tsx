'use client';
import {useEffect} from 'react';
import {useLocale} from 'next-intl';
import {stashProjectInviteCode} from '@/lib/pro/project-invite-handoff';

/** Round 7A: not signed in — keep the code of the fragment for after sign-in, then go to sign-in. */
export function ProjectInvitationLogin({loginPath}:{loginPath:string}){
 const en=useLocale()==='en';
 useEffect(()=>{
  const code=new URLSearchParams(window.location.hash.slice(1)).get('codigo');
  if(code)stashProjectInviteCode(code);
  window.history.replaceState(null,'',window.location.pathname+window.location.search);
  window.location.replace(loginPath);
 },[loginPath]);
 return <main className="mx-auto max-w-xl px-4 py-10"><p role="status" data-project-invitation-login className="text-sm text-[#52627a]">{en?'Sign in to join the job. Your invitation code is kept for after you sign in.':'Inicie sesión para unirse al proyecto. Su código de invitación se conserva para después de iniciar sesión.'}</p></main>;
}
