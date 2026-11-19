'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

/** The section owns its actions; the existing visible header owns placement. */
export function ProSectionActions({children}:{children:ReactNode}){
 const [target,setTarget]=useState<Element|null|undefined>(undefined);
 useEffect(()=>{
  let frame=0;
  const find=()=>{
   const next=Array.from(document.querySelectorAll('[data-pro-section-actions-slot]')).find(node=>node.getClientRects().length>0)??null;
   setTarget(old=>old===next?old:next);
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(find);};
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
  find();window.addEventListener('resize',schedule);
  return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);};
 },[]);
 return target===undefined?null:target?createPortal(children,target):<div className="flex justify-end">{children}</div>;
}
