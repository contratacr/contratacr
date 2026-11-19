'use client';
import {useCallback,useState} from 'react';
import {useLocale} from 'next-intl';
import type {PrivateEstimate} from '@/lib/pro/private-estimates';
import {Button} from '@/components/ui/button';
import {ProModal as Modal} from './modal';
import {PrivateEstimatePublications,type ExpectedEstimatePublication} from './private-estimate-publications';
import {EsignRequests} from './esign-requests';
/** Review an authorized immutable publication without constructing a private draft. */
export function PrivateEstimatePublicationReview({estimateId,publication,blocked=false,onStateChange,onClose,onOpenCopiedDraft}:{estimateId:string;publication:ExpectedEstimatePublication;blocked?:boolean;onStateChange:(state:{dirty:boolean;busy:boolean})=>void;onClose:()=>void;onOpenCopiedDraft?:(estimate:PrivateEstimate)=>void}){const en=useLocale()==='en',[state,setState]=useState({dirty:false,busy:false}),report=useCallback((value:{dirty:boolean;busy:boolean})=>{setState(value);onStateChange(value);},[onStateChange,setState]);function close(){if(!blocked&&!state.dirty&&!state.busy)onClose();}return <Modal closeLabel={en?'Close dialog':'Cerrar diálogo'} open manageFocus title={en?'Shared quote':'Cotización compartida'} onClose={close} footer={<Button type="button" variant="outline" disabled={blocked||state.dirty||state.busy} onClick={close}>{en?'Close':'Cerrar'}</Button>}><section data-private-estimate-publication-review><PrivateEstimatePublications onOpenCopiedDraft={onOpenCopiedDraft} ownerEstimateId={estimateId} initialPublicationId={publication.publicationId} expectedPublication={publication} blocked={blocked} onStateChange={report} onKeepClose={onClose}/><div className="mt-4"><EsignRequests kind="quote" documentId={publication.publicationId} disabled={blocked}/></div></section></Modal>;}
