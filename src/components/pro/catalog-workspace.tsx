'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {useProSearchParams} from './use-pro-search-params';
import {replaceProParams} from '@/lib/pro/navigation';
import {createInventoryWrite,readInventoryWrite,saveInventoryWrite,mergeInventoryWrite,continueInventoryWrite,clearInventoryWrite,inventoryWriteInputSchema,InventoryWriteFailure,type InventoryWrite} from '@/lib/pro/inventory-write-recovery';
import {useAuth} from '@/hooks/use-auth';
import {createClientWrite,readClientWrite,saveClientWrite,mergeClientWrite,continueClientWrite,clearClientWrite,ClientWriteFailure,type ClientWrite} from '@/lib/pro/client-write-recovery';
import {useTranslations} from 'next-intl';
import { BusinessPanel } from './business-panel';
import { businessSchema, emptyBusiness, type Business } from '@/lib/pro/business';
import type { CatalogKind } from '@/lib/pro/catalog-import';
import {ProductClipper} from './product-clipper';
export type CatalogControls = {
  inventoryRecovery?: {attempt:InventoryWrite|null;blocked:boolean;save:(row:Business['products'][number],mode:'create'|'edit'|'movement',movements:Business['movements'])=>Promise<boolean>;retry:()=>Promise<boolean>};
  clientRecovery?: {attempt:ClientWrite|null;blocked:boolean;save:(row:Business['clients'][number],mode:'create'|'edit')=>Promise<boolean>;retry:()=>Promise<boolean>};
  ids: string[]; search: string; filter: string; loading: boolean; hasMore: boolean;
  setSearch: (value: string) => void; setFilter: (value: string) => void;
  more: () => void; detail: (id: string) => Promise<Business['clients'][number] | Business['products'][number] | false>;
  importCommit: (next: Business) => Promise<boolean>;
  exportRows: () => Promise<Business>;
  moreMovements: () => void; hasMoreMovements: boolean;
};
async function read(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json();
  if (!response.ok) throw Error(body.error || 'No se pudieron cargar los datos.');
  return body;
}
export function CatalogWorkspace({kind}:{kind:CatalogKind}){
 const {user,loading}=useAuth(),copy=useTranslations('ProEditorUX');
 if(loading||!user)return <p role={loading?'status':'alert'}>{copy(loading?'loading':'sessionRequired')}</p>;
 return <CatalogWorkspaceSession key={user.id+':'+kind} kind={kind} actorId={user.id}/>;
}
function CatalogWorkspaceSession({ kind,actorId }: { kind: CatalogKind;actorId:string }) {
 const cw=useTranslations("ProCatalogCopy");
 const copy=useTranslations("ProControlsUX"),params=useProSearchParams();
  const [data, setData] = useState<Business>(emptyBusiness);
  const [accountId, setAccountId] = useState(''), [ready, setReady] = useState(false);
  const [detailLoading,setDetailLoading]=useState(false),[inventoryCoherent,setInventoryCoherent]=useState(true);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [loading, setLoading] = useState(false);
  const active=useRef(true),pending=useRef<ClientWrite|null>(null);
  const [clientNotice,setClientNotice]=useState('');
  const [clientAttempt,setClientAttempt]=useState<ClientWrite|null>(null),[recoveryBlocked,setRecoveryBlocked]=useState(false),[recoveryReady,setRecoveryReady]=useState(kind!=='clients');
  const draftKey=`ccr:pro:form:${actorId}:Clientes`,ownerKey=draftKey+':write-owner';
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{
   if(kind!=='clients')return;
   try{const tab=readClientWrite(sessionStorage,actorId),global=readClientWrite(localStorage,actorId);let stored=tab?(global?.body===tab.body?mergeClientWrite(tab,global):tab):global;if(pending.current&&(!stored||stored.body===pending.current.body))stored=mergeClientWrite(pending.current,stored);
    if(stored){pending.current=stored;setClientAttempt(stored);setRecoveryBlocked(true);}
    setRecoveryReady(true);
   }catch{setRecoveryBlocked(true);setError(cw("customerRecoveryBlocked"));}
  },[actorId,kind,cw]);
  const inventoryPending=useRef<InventoryWrite|null>(null);
  const [inventoryNotice,setInventoryNotice]=useState('');
  const [inventoryAttempt,setInventoryAttempt]=useState<InventoryWrite|null>(null),[inventoryBlocked,setInventoryBlocked]=useState(false),[inventoryReady,setInventoryReady]=useState(kind!=='products');
  const inventoryDraftKey=`ccr:pro:form:${actorId}:Inventario`,inventoryOwnerKey=inventoryDraftKey+':write-owner';
  useEffect(()=>{
   if(kind!=='products')return;
   try{const tab=readInventoryWrite(sessionStorage,actorId),global=readInventoryWrite(localStorage,actorId);let stored=tab?(global?.body===tab.body?mergeInventoryWrite(tab,global):tab):global;if(inventoryPending.current&&(!stored||stored.body===inventoryPending.current.body))stored=mergeInventoryWrite(inventoryPending.current,stored);
    if(stored){inventoryPending.current=stored;setInventoryAttempt(stored);setInventoryBlocked(true);const product=inventoryWriteInputSchema.parse(JSON.parse(stored.body)).rows[0];setData(old=>({...old,products:[...old.products.filter(row=>row.id!==product.id),product]}));}
    setInventoryReady(true);
   }catch{setInventoryBlocked(true);setError(cw("inventoryRecoveryBlocked"));}
  },[actorId,kind,cw]);
  const search=params.get('q')||'',filter=(kind==='products'?['all','low','archived','products','services']:['all','archived']).includes(params.get('mostrar')||'')?params.get('mostrar')!:'all';
  const [ids, setIds] = useState<string[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [movementCursor, setMovementCursor] = useState<string | null>(null);
  const movementProduct = useRef(''), detailSequence = useRef(0);
  const selectedRows = useRef<(Business['clients'][number] | Business['products'][number])[]>([]);
  const selectedVersion=useRef<{id:string;revision:number}|null>(null);
  const revision = useRef(0), sequence = useRef(0), lock = useRef(false), pageLock = useRef(false);
  const invalidate = useCallback(() => { sequence.current++; pageLock.current = false; }, []);
  useEffect(()=>()=>{detailSequence.current++;},[]);
  const query = useCallback((after = '') => '/api/pro/catalog?' + new URLSearchParams({ kind, q: search, filter:filter==='products'||filter==='services'?'all':filter, after,...(kind==='products'?{itemType:filter==='products'?'product':filter==='services'?'service':'all'}:{}) }), [kind, search, filter]);
  const load = useCallback(async (after = '') => {
    if (after && pageLock.current) return;
    const request = ++sequence.current; pageLock.current = true; setLoading(true); setError('');
    try {
      const body = await read(query(after));
      if(body.userId!==actorId)throw Error(copy("changed"));
      if (request !== sequence.current) return;
      if(after&&revision.current!==body.revision)throw Error(copy('changed'));
      const rows = businessSchema.shape[kind].parse(body.items);
      if(selectedVersion.current){const fresh=rows.find(row=>row.id===selectedVersion.current!.id);
        if(fresh){selectedRows.current=[fresh];selectedVersion.current={id:fresh.id,revision:body.revision};}
        else if(selectedVersion.current.revision!==body.revision)selectedRows.current=[];
      }
      // Keep the oldest revision across appended pages. Any intervening write requires a reload.
      if (!after) revision.current = body.revision;
      setData(old => ({ ...old, [kind]: after ? [...old[kind].filter(r => !rows.some(n => n.id === r.id)), ...rows] : [...rows,...selectedRows.current.filter(r=>!rows.some(n=>n.id===r.id))] }));
      setIds(old => after ? [...new Set([...old, ...rows.map(r => r.id)])] : rows.map(r => r.id));
      setCursor(body.nextCursor); setAccountId(body.userId); setReady(true);
    } catch (e) { if (request === sequence.current) setError((e as Error).message); }
    finally { if (request === sequence.current) { pageLock.current = false; setLoading(false);setInventoryCoherent(!selectedVersion.current||selectedVersion.current.revision===revision.current); } }
  }, [kind, query,copy,actorId]);
  useEffect(() => {
    // Invalidate in-flight responses immediately, before the search debounce expires.
    invalidate();
    const timer = setTimeout(() => void load(), 250);
    return () => { clearTimeout(timer); invalidate(); };
  }, [load, invalidate]);
  async function movements(id: string, after = '', request = detailSequence.current) {
    const body = await read('/api/pro/catalog?' + new URLSearchParams({ kind: 'movements', q: id, after }));
    if (request !== detailSequence.current || movementProduct.current !== id) return;
    const rows = businessSchema.shape.movements.parse(body.items);
    setData(old => ({ ...old, movements: after ? [...old.movements.filter(r => !rows.some(n => n.id === r.id)), ...rows] : rows }));
    setMovementCursor(body.nextCursor);
  }
  async function detail(id: string) {
    const request = ++detailSequence.current;setError('');setDetailLoading(true);
    try {
      const body = await read('/api/pro/catalog?' + new URLSearchParams({ kind, id, option: '1' }));
      if (request !== detailSequence.current) return false;
      const document = businessSchema.parse(body.document);
      if(!document[kind].some(row=>row.id===id))throw Error('Registro no disponible.');
      if(body.revision<revision.current)throw Error(copy('changed'));
      selectedRows.current=document[kind];selectedVersion.current={id,revision:body.revision};
      // Do not advance the page revision when only a detail has been refreshed.
      setData(old => ({ ...old, [kind]: [...old[kind].filter(r => r.id !== id), ...document[kind]], work: document.work, quotes: document.quotes, quoteLinks: document.quoteLinks, movements: [] }));
      setMovementCursor(null);
      if (kind === 'products' && document.products[0]?.itemType!=='service') { movementProduct.current = id; await movements(id, '', request); }
      return document[kind][0];
    } catch (e) { if(request===detailSequence.current)setError((e as Error).message);return false; }
    finally{if(request===detailSequence.current){setDetailLoading(false);setInventoryCoherent(!selectedVersion.current||selectedVersion.current.revision===revision.current);}}
  }
  async function commit(next: Business, importing = false) {
    if (lock.current || loading || (kind==='clients'&&pending.current||kind==='products'&&inventoryPending.current)) return false;
    lock.current = true; setSaving(true); setError('');
    try {
      const previous = data;
      const rows = next[kind].filter(r => JSON.stringify(r) !== JSON.stringify(previous[kind].find(old => old.id === r.id)));
      const changes = next.movements.filter(r => !previous.movements.some(old => old.id === r.id));
      if(!rows.length&&!changes.length)return true;
      if(selectedVersion.current&&rows.some(row=>row.id===selectedVersion.current!.id)&&selectedVersion.current.revision!==revision.current)throw Error(copy('changed'));
      const body = await read('/api/pro/catalog', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, revision: revision.current, rows, movements: changes, importing }) });
      revision.current = body.revision;
      if(selectedVersion.current){const selected=next[kind].find(row=>row.id===selectedVersion.current!.id);if(selected&&rows.some(row=>row.id===selected.id)){selectedRows.current=[selected];selectedVersion.current={id:selected.id,revision:body.revision};}}
      await load();
      return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { lock.current = false; setSaving(false); }
  }
  async function saveCustomer(row?:Business['clients'][number],mode?:'create'|'edit'){
   if(lock.current||!active.current)return false;
   lock.current=true;setSaving(true);setError('');let started=false;const fresh=!pending.current;
   try{
    let attempt=pending.current;
    if(!attempt){
     const existing=readClientWrite(localStorage,actorId);
     if(existing){pending.current=existing;setClientAttempt(existing);setRecoveryBlocked(true);return false;}
     if(!row||!mode)throw Error();
     if(mode==='edit'&&selectedVersion.current?.id===row.id&&selectedVersion.current.revision!==revision.current)throw Error(copy('changed'));
     attempt=createClientWrite(actorId,{kind:'clients',revision:revision.current,rows:[row],movements:[],importing:false,clientActionId:crypto.randomUUID(),clientWriteMode:mode});
     const marker=JSON.stringify({accountId:actorId,body:attempt.body,rawDraft:sessionStorage.getItem(draftKey)});sessionStorage.setItem(ownerKey,marker);if(sessionStorage.getItem(ownerKey)!==marker)throw Error();
    }
    const result=await continueClientWrite({store:localStorage,attempt,request:(url,init)=>{if(init?.method==='PATCH')started=true;return fetch(url,init);},currentAccount:()=>active.current?actorId:undefined,onCheckpoint:value=>{pending.current=value;if(active.current){setClientAttempt(value);setRecoveryBlocked(true);}saveClientWrite(sessionStorage,value);}});
    if(!active.current)return false;
    if(result.status==='rejected'){clearClientWrite(sessionStorage,result.attempt);pending.current=null;setClientAttempt(null);setRecoveryBlocked(false);setError(cw("customerNotSaved"));return false;}
    setData(old=>({...old,clients:[...old.clients.filter(item=>item.id!==result.client.id),result.client]}));
    const rawOwner=sessionStorage.getItem(ownerKey);if(rawOwner){const marker=JSON.parse(rawOwner);if(marker.accountId===actorId&&marker.body===result.attempt.body){if(typeof marker.rawDraft==='string'&&sessionStorage.getItem(draftKey)===marker.rawDraft)sessionStorage.removeItem(draftKey);sessionStorage.removeItem(ownerKey);}}
    clearClientWrite(localStorage,result.attempt);clearClientWrite(sessionStorage,result.attempt);pending.current=null;setClientAttempt(null);setRecoveryBlocked(false);setClientNotice(result.newer?cw("customerSavedNewer"):cw("customerSaved"));void load();return true;
   }catch(error){
    if(!active.current)return false;
    if(fresh&&!started&&error instanceof ClientWriteFailure&&error.kind==='storage'&&error.attempt.phase!=='confirmed'){
     try{const other=readClientWrite(localStorage,actorId);if(other&&other.body!==error.attempt.body){clearClientWrite(sessionStorage,error.attempt);pending.current=other;setClientAttempt(other);setRecoveryBlocked(true);}}catch{/* Retain the original attempt if storage is unavailable. */}
    }
    setError(cw("checkBeforeContinuing"));return false;
   }finally{lock.current=false;if(active.current)setSaving(false);}
  }
  async function saveInventory(row?:Business['products'][number],mode?:'create'|'edit'|'movement',movements:Business['movements']=[]){
   if(lock.current||!active.current)return false;
   if(!inventoryPending.current&&(!ready||loading||detailLoading||selectedVersion.current&&selectedVersion.current.revision!==revision.current)){setError(copy('changed'));return false;}
   lock.current=true;setSaving(true);setError('');let started=false;const fresh=!inventoryPending.current;
   try{
    let attempt=inventoryPending.current;
    if(!attempt){
     const existing=readInventoryWrite(localStorage,actorId);
     if(existing){inventoryPending.current=existing;setInventoryAttempt(existing);setInventoryBlocked(true);return false;}
     if(!row||!mode)throw Error();
     if(mode!=='create'&&selectedVersion.current?.id===row.id&&selectedVersion.current.revision!==revision.current)throw Error(copy('changed'));
     attempt=createInventoryWrite(actorId,{kind:'products',revision:revision.current,rows:[row],movements,importing:false,inventoryActionId:crypto.randomUUID(),inventoryWriteMode:mode});
     const marker=JSON.stringify({accountId:actorId,body:attempt.body,rawDraft:mode==='movement'?null:sessionStorage.getItem(inventoryDraftKey)});sessionStorage.setItem(inventoryOwnerKey,marker);if(sessionStorage.getItem(inventoryOwnerKey)!==marker)throw Error();
    }
    const result=await continueInventoryWrite({store:localStorage,attempt,request:(url,init)=>{if(init?.method==='PATCH')started=true;return fetch(url,init);},currentAccount:()=>active.current?actorId:undefined,onCheckpoint:value=>{inventoryPending.current=value;if(active.current){setInventoryAttempt(value);setInventoryBlocked(true);}saveInventoryWrite(sessionStorage,value);}});
    if(!active.current)return false;
    if(result.status==='rejected'){clearInventoryWrite(sessionStorage,result.attempt);inventoryPending.current=null;setInventoryAttempt(null);setInventoryBlocked(false);setError(cw("inventoryNotSaved"));return false;}
    setData(old=>({...old,products:[...old.products.filter(item=>item.id!==result.product.id),result.product]}));
    const rawOwner=sessionStorage.getItem(inventoryOwnerKey);if(rawOwner){const marker=JSON.parse(rawOwner);if(marker.accountId===actorId&&marker.body===result.attempt.body){if(typeof marker.rawDraft==='string'&&sessionStorage.getItem(inventoryDraftKey)===marker.rawDraft)sessionStorage.removeItem(inventoryDraftKey);sessionStorage.removeItem(inventoryOwnerKey);}}
    clearInventoryWrite(localStorage,result.attempt);clearInventoryWrite(sessionStorage,result.attempt);inventoryPending.current=null;setInventoryAttempt(null);setInventoryBlocked(false);setInventoryNotice(result.newer?cw("itemSavedNewer"):cw("itemSaved"));void load();return true;
   }catch(error){
    if(!active.current)return false;
    if(fresh&&!started&&error instanceof InventoryWriteFailure&&error.kind==='storage'&&error.attempt.phase!=='confirmed'){
     try{const other=readInventoryWrite(localStorage,actorId);if(other&&other.body!==error.attempt.body){clearInventoryWrite(sessionStorage,error.attempt);inventoryPending.current=other;setInventoryAttempt(other);setInventoryBlocked(true);}}catch{/* Retain the original attempt if storage is unavailable. */}
    }
    setError(cw("checkBeforeContinuing"));return false;
   }finally{lock.current=false;if(active.current)setSaving(false);}
  }
  async function reloadCatalog(){
   await load();
   // The open record may be outside the current page: refresh its detail too, so the
   // editor's revision matches again without discarding the form draft.
   const selected=selectedVersion.current;
   if(kind==='products'&&selected&&selected.revision!==revision.current)await detail(selected.id);
  }
  async function exportRows() {
    const result = emptyBusiness(); let after = ''; let exportRevision: number | undefined;
    do {
      const body = await read(query(after));
      if(exportRevision!==undefined&&body.revision!==exportRevision)throw Error('Los datos cambiaron durante la exportación. Intente de nuevo.');
      exportRevision=body.revision;
      const rows = businessSchema.shape[kind].parse(body.items);
      if (kind === 'clients') result.clients.push(...businessSchema.shape.clients.parse(rows));
      else result.products.push(...businessSchema.shape.products.parse(rows));
      after = body.nextCursor || '';
    } while (after);
    return result;
  }
  // A stale selected revision (409 / concurrent change) is a recoverable error, not a save in
  // progress: the editor keeps the draft, «Cerrar» works and «Recargar datos» refreshes it.
  const inventoryNotReady=kind==='products'&&!inventoryAttempt&&(!ready||loading||detailLoading);
  const inventoryStale=kind==='products'&&!inventoryAttempt&&ready&&!loading&&!detailLoading&&!inventoryCoherent;
  return <div data-pro-workspace="">{kind==='products'&&<ProductClipper disabled={!ready||!!inventoryAttempt||saving} onSave={row=>saveInventory(row,'create')}/>}{inventoryNotice&&<p role="status" className="mb-3 text-sm">{inventoryNotice}</p>}{clientNotice&&<p role="status" className="mb-3 text-sm">{clientNotice}</p>}<BusinessPanel accountId={accountId} section={kind === 'clients' ? 'Clientes' : 'Inventario'} data={data} ready={ready&&recoveryReady&&inventoryReady} error={error||(inventoryStale?copy('changed'):'')} saving={saving || loading || inventoryNotReady} commit={commit} reload={() => void reloadCatalog()}
    catalog={{ ...(kind==='products'?{inventoryRecovery:{attempt:inventoryAttempt,blocked:inventoryBlocked,save:saveInventory,retry:()=>saveInventory()}}:{}),...(kind==='clients'?{clientRecovery:{attempt:clientAttempt,blocked:recoveryBlocked,save:saveCustomer,retry:()=>saveCustomer()}}:{}),ids, search, filter, loading, hasMore: !!cursor, setSearch: value => { if(value===search)return; invalidate(); setLoading(true); setIds([]); setCursor(null); replaceProParams({q:value}); }, setFilter: value => { if(value===filter)return; invalidate(); setLoading(true); setIds([]); setCursor(null); replaceProParams({mostrar:value==='all'?null:value}); }, more: () => { if (cursor) void load(cursor); }, detail, importCommit: next => commit(next, true), exportRows,
      hasMoreMovements: !!movementCursor, moreMovements: () => { if (movementCursor) void movements(movementProduct.current, movementCursor).catch(e => setError(e.message)); } }} /></div>;
}
