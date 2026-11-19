'use client';
import {useEffect,useRef} from 'react';

/**
 * Round 2: a validation error or a confirmation that appears out of view is as good as none.
 * When `value` becomes non-empty (or changes), bring the element into view inside its own
 * scroller — the modal body, not the dialog — without moving keyboard focus.
 */
export function useReveal<T extends HTMLElement>(value:unknown){
 const ref=useRef<T|null>(null);
 useEffect(()=>{if(!value)return;const node=ref.current;if(!node)return;const frame=requestAnimationFrame(()=>node.scrollIntoView({block:'nearest',inline:'nearest'}));return()=>cancelAnimationFrame(frame);},[value]);
 return ref;
}
