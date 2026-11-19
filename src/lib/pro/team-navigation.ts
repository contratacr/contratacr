import {PRO_BEFORE_PATH_CHANGE,navigatePro,proJobRoute} from './navigation';
/** Gaps round (2026-11-17): «Equipo» is a section of the Pro space (?tab=pro_team). Inside the Pro space it opens
 * like any other section; from elsewhere it loads the Pro space on that section. The open editors' guard runs first. */
export function openTeamSpace(english:boolean){
 if(/^\/(?:es\/|en\/)?dashboard\/pro(?:\/equipo)?$/.test(window.location.pathname)||proJobRoute(window.location.pathname)){navigatePro('pro_team');return;}
 const path=(english?'/en':'')+'/dashboard/pro?tab=pro_team';
 if(window.dispatchEvent(new CustomEvent(PRO_BEFORE_PATH_CHANGE,{cancelable:true,detail:{path}})))window.location.assign(path);
}
