'use client';
import { useState, useRef } from 'react';
import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { PromotionHistory } from './promotion-history';
import type { PromotionRecord } from '@/lib/pro/promotion-records';
import { crTodayISO } from '@/lib/time-cr';
type Account = {
    id: string;
    full_name: string;
    email: string;
};
type Content = {
    id: string;
    title: string;
    link: string;
};
const field = 'mt-1 block min-h-11 w-full min-w-0 max-w-full box-border rounded-xl border border-[#e5e7eb] bg-white p-3 text-[#162543]';
export function PromotionAdmin() {
    const en = useLocale() === 'en', tr = (es: string, english: string) => en ? english : es;
    const [query, setQuery] = useState(''), [accounts, setAccounts] = useState<Account[]>([]), [account, setAccount] = useState<Account | null>(null), [type, setType] = useState<PromotionRecord['contentType']>('profile'), [content, setContent] = useState<Content[]>([]), [selected, setSelected] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [page, setPage] = useState(0), [total, setTotal] = useState(0), [saved, setSaved] = useState<PromotionRecord | null>(null);
    const lock = useRef(false), requestId = useRef('');
    async function load(a: Account, t: PromotionRecord['contentType'], p = 0) { setBusy(true); setMessage(''); try {
        const r = await fetch(`/api/admin/pro/promotions?userId=${a.id}&type=${t}&page=${p}`);
        if (!r.ok)
            throw Error();
        const b = await r.json();
        setContent(b.content);
        setTotal(b.total);
        setSelected(b.content[0]?.id || '');
        setPage(p);
    }
    catch {
        setMessage(tr('No se pudo consultar el contenido.', 'Could not load content.'));
    }
    finally {
        setBusy(false);
    } }
    return <section className="space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-6" data-promotion-admin><h2 className="text-xl font-bold text-[#162543]">{tr('Difusión de publicaciones', 'Publication promotion')}</h2><p className="text-sm text-[#68778d]">{tr('Registre la difusión que ya realizó. El profesional verá la red, la fecha y el enlace en su publicación.', 'Record promotion already carried out. The professional sees the channel, date and link on their post.')}</p>
 <label className="block text-sm font-semibold">{tr('Cuenta a promocionar', 'Account to promote')}<input className={field} value={query} onChange={e => { setQuery(e.target.value); setAccount(null); setContent([]); setSaved(null); }}/></label><Button variant="secondary" disabled={busy || query.trim().length < 2} onClick={async () => { setBusy(true); try {
        const r = await fetch('/api/admin/pro?q=' + encodeURIComponent(query));
        if (!r.ok)
            throw Error();
        const b = await r.json();
        setAccounts(b.accounts);
        setMessage(b.accounts.length ? '' : tr('No se encontraron cuentas.', 'No accounts found.'));
    }
    catch {
        setMessage(tr('No se pudo buscar.', 'Search failed.'));
    }
    finally {
        setBusy(false);
    } }}>{tr('Buscar cuenta para difusión', 'Find promotion account')}</Button>
 {accounts.map(a => <button key={a.id} type="button" className="block w-full rounded-xl border p-3 text-left" onClick={() => { setAccount(a); setAccounts([]); requestId.current = ''; void load(a, type); }}><strong>{a.full_name}</strong><span className="block text-sm text-[#68778d]">{a.email}</span></button>)}
 {account && <form key={account.id} className="grid gap-4 sm:grid-cols-2" onChange={() => { requestId.current = ''; setSaved(null); }} onSubmit={async (e) => { e.preventDefault(); if (lock.current)
            return; lock.current = true; setBusy(true); setMessage(''); const f = new FormData(e.currentTarget); requestId.current ||= crypto.randomUUID(); try {
            const r = await fetch('/api/admin/pro/promotions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: requestId.current, userId: account.id, contentType: type, contentId: selected, channel: f.get('channel'), occurredOn: f.get('occurredOn'), paid: f.get('paid') === 'on', publishedUrl: f.get('publishedUrl') }) });
            const b = await r.json();
            if (!r.ok)
                throw Error(b.error);
            setSaved(b.record);
            setMessage(tr('Difusión registrada. No se publicó ni se pagó ningún anuncio.', 'Promotion recorded. No post or paid ad was created.'));
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : tr('No se pudo guardar.', 'Could not save.'));
        }
        finally {
            lock.current = false;
            setBusy(false);
        } }}>
 <p className="font-semibold sm:col-span-2">{account.full_name}</p><label className="text-sm font-semibold">{tr('Tipo de contenido', 'Content type')}<select aria-label={tr('Tipo de contenido', 'Content type')} className={field} value={type} disabled={busy} onChange={e => { const t = e.target.value as PromotionRecord['contentType']; setType(t); void load(account, t); }}>{[['profile', tr('Perfil', 'Profile')], ['project', tr('Proyecto', 'Project')], ['offer', tr('Promoción', 'Offer')], ['job', tr('Empleo', 'Job')]].map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
 <label className="text-sm font-semibold">{tr('Contenido publicado', 'Published content')}<select aria-label={tr('Contenido publicado', 'Published content')} className={field} value={selected} disabled={busy} onChange={e => setSelected(e.target.value)} required>{!content.length && <option value="">{tr('No hay contenido', 'No content')}</option>}{content.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
 {total > 20 && <div className="flex gap-2 sm:col-span-2"><Button type="button" variant="secondary" disabled={page === 0 || busy} onClick={() => load(account, type, page - 1)}>{tr('Anterior', 'Previous')}</Button><Button type="button" variant="secondary" disabled={(page + 1) * 20 >= total || busy} onClick={() => load(account, type, page + 1)}>{tr('Siguiente', 'Next')}</Button></div>}
 <label className="text-sm font-semibold">{tr('Red social', 'Social network')}<select name="channel" className={field}><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option></select></label><label className="text-sm font-semibold">{tr('Fecha de difusión', 'Promotion date')}<input name="occurredOn" type="date" required max={crTodayISO()} defaultValue={crTodayISO()} className={field + ' appearance-none'}/></label>
 <label className="text-sm font-semibold sm:col-span-2">{tr('Enlace de la publicación en redes', 'Social post link')}<input name="publishedUrl" type="url" required className={field}/></label><label className="flex items-center gap-2 text-sm sm:col-span-2"><input name="paid" type="checkbox"/>{tr('Fue un anuncio pagado', 'This was a paid ad')}</label><Button disabled={busy || !selected || !!saved}>{tr('Registrar difusión realizada', 'Record completed promotion')}</Button>
 </form>}
 {account && selected && <PromotionHistory key={`${account.id}:${type}:${selected}:${saved?.id || ""}`} adminUserId={account.id} contentType={type} contentId={selected}/>}
 {message && <p role="status" className="text-sm">{message}</p>}{saved && <div className="rounded-xl bg-[#eaf7fc] p-3 text-sm">{saved.title} · {saved.channel} · {saved.occurredOn}<a href={saved.publishedUrl} target="_blank" rel="noopener noreferrer" className="ml-2 font-semibold text-[#0089bb]">{tr('Ver publicación', 'View post')}</a></div>}
 </section>;
}
