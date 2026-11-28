import type {ReactNode} from 'react';
import {LandingNavbar,type SeccionInicialDeBarra} from '@/components/landing/landing-navbar';
import {DirectoryQuickNav} from '@/components/landing/directory-nav';
import {LandingFooter} from '@/components/landing/landing-footer';

/**
 * LOCAL PRO ONLY (multivertical): site chrome for the public directory pages (same navbar/footer and logo component
 * as the rest of the public site). The page content brings its own <main id="contenido">.
 * `section`: the phone bar of a detail screen («← Restaurantes ···»), painted by the server so it does not jump when the
 * page hydrates; pass the same values as the page's SectionHeaderTitle.
 */
export function DirectoryShell({children,section,footer='desktop'}:{children:ReactNode;section?:SeccionInicialDeBarra;footer?:'full'|'desktop'}){
 return <div className="flex min-h-screen flex-col bg-white">
  <LandingNavbar seccionInicial={section}/>
  <div className="ccr-navbar-spacer h-16" aria-hidden/>
  {/* Detail and task pages: the sections row is desktop-only; phones keep the screen's own header. */}
  <DirectoryQuickNav className="max-lg:!hidden"/>
  <div className="flex-1">{children}</div>
  {/* Footer rule (owner 2026-11-27, same as FooterSoloWeb in prod): content pages (Precios, Cómo ordenamos) keep it
      everywhere; tool, list and detail screens drop it on phones and keep it on desktop (links still count for SEO). */}
  {footer==='full'?<LandingFooter/>:<div className="hidden lg:block"><LandingFooter/></div>}
 </div>;
}
