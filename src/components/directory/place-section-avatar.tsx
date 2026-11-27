import {createElement} from 'react';
import {cn} from '@/lib/utils';
import {DIRECTORY_SECTION_ICONS} from '@/lib/directory/directory-groups';
import {placeSectionById} from '@/lib/directory/place-verticals';
import {placeVerticalIcon} from './place-photo-placeholder';
import {profileIdentityAvatarClass} from '@/components/professionals/profile-identity-name';

/**
 * Round avatar of a business WITHOUT a real photo (owner 2026-11-27, «cuando hay foto la foto, si no el ícono mejorado»):
 * the production «improved» icon style — the professional profile's soft #EBF5FB circle with the brand-blue outline icon
 * (same tint as the group icons of /servicios) — at the size of the professional avatar. The icon is the section's own
 * (DIRECTORY_SECTION_ICONS, the one used by the menus and hubs), so a section shows the same icon everywhere.
 * ONE place for this rendering: switching to the shared section-visuals module is a one-line import change here.
 */
export function PlaceSectionAvatar({verticalId,className,size='profile'}:{verticalId:string;className?:string;size?:'profile'}){
 const section=placeSectionById(verticalId)?.section;
 const Icon=(section?DIRECTORY_SECTION_ICONS[section]:undefined)??placeVerticalIcon(verticalId);
 return <span data-place-avatar="section" data-place-section-icon={section??verticalId}
  className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#EBF5FB] text-[#009FD9]',size==='profile'&&profileIdentityAvatarClass,className)}>
  {createElement(Icon,{'aria-hidden':true,className:'h-8 w-8 sm:h-10 sm:w-10',strokeWidth:1.6})}</span>;
}
