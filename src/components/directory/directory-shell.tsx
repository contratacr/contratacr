import type {ReactNode} from 'react';
import {LandingNavbar} from '@/components/landing/landing-navbar';
import {DirectoryQuickNav} from '@/components/landing/directory-nav';
import {LandingFooter} from '@/components/landing/landing-footer';

/**
 * LOCAL PRO ONLY (multivertical): site chrome for the public directory pages (same navbar/footer and logo component
 * as the rest of the public site). The page content brings its own <main id="contenido">.
 */
export function DirectoryShell({children}:{children:ReactNode}){
 return <div className="flex min-h-screen flex-col bg-white">
  <LandingNavbar/>
  <div className="ccr-navbar-spacer h-16" aria-hidden/>
  <DirectoryQuickNav/>
  <div className="flex-1">{children}</div>
  <LandingFooter/>
 </div>;
}
