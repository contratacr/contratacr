import {cn} from '@/lib/utils';
import {verticalSection} from '@/lib/visuals/section-visuals';
import {SectionIcon} from '@/lib/visuals/section-icon';
import {profileIdentityAvatarClass} from '@/components/professionals/profile-identity-name';

/**
 * Round avatar of a business WITHOUT a real photo (owner 2026-11-27, «cuando hay foto la foto, si no el ícono mejorado»):
 * the section's one icon in the production «improved» style (<SectionIcon>, lib/visuals/section-icon.tsx), at the size of
 * the professional avatar. Same glyph as the menus, Categorías and the search sheet.
 */
export function PlaceSectionAvatar({verticalId,className,size='profile'}:{verticalId:string;className?:string;size?:'profile'}){
 const section=verticalSection(verticalId);
 return <span data-place-avatar="section" data-place-section-icon={section??verticalId} className={cn('relative grid shrink-0 overflow-hidden rounded-full',size==='profile'&&profileIdentityAvatarClass,className)}>
  <SectionIcon vertical={verticalId} size="xl" className="h-full w-full" glyphClassName="h-8 w-8 sm:h-10 sm:w-10"/></span>;
}
