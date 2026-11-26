'use client';
import {useRef,type ReactNode} from 'react';
import {useDesvanecidoDeCarril} from '@/hooks/use-desvanecido-de-carril';

/**
 * Chip row of the place header (2026-11-26, owner «que se vea más ordenado»): on phones the row slides sideways and its
 * edges fade with the same rail mask as the professional profile's tabs, so a cut chip reads as «hay más». From lg the
 * row wraps and nothing is masked. The data-* hooks of the row are passed through untouched.
 */
export function PlaceChipRail({className,children,...data}:{className:string;children:ReactNode}&Record<`data-${string}`,string|boolean|undefined>){
 const ref=useRef<HTMLDivElement>(null);
 const {mascara}=useDesvanecidoDeCarril(ref);
 return <div ref={ref} className={className} style={mascara?{maskImage:mascara,WebkitMaskImage:mascara}:undefined} {...data}>{children}</div>;
}
