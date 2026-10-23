'use client';
import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import type { PromotionRecord } from '@/lib/pro/promotion-records';
export function PromotionHistory({ contentType, contentId, adminUserId }: {
    adminUserId?: string;
    contentType: PromotionRecord['contentType'];
    contentId: string;
}) {
    const en = useLocale() === 'en';
    const [rows, setRows] = useState<PromotionRecord[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(0), [loading, setLoading] = useState(false);
    useEffect(() => { const controller = new AbortController(); fetch(`${adminUserId ? "/api/admin/pro/promotions" : "/api/pro/promotions"}?type=${contentType}&contentId=${contentId}&page=${page}${adminUserId ? "&userId=" + adminUserId : ""}`, { signal: controller.signal, cache: 'no-store' }).then(async (r) => { if (!r.ok)
        return; const b = await r.json(); setRows(old => page ? [...old, ...b.records] : b.records); setTotal(b.total); }).catch(() => { }).finally(() => { if (!controller.signal.aborted)
        setLoading(false); }); return () => controller.abort(); }, [contentType, contentId, page, adminUserId]);
    if (!rows.length)
        return null;
    return <section data-promotion-history className="mt-6 space-y-3 rounded-2xl border border-[#e5e7eb] bg-[#f7fbfd] p-4"><h3 className="font-bold text-[#162543]">{en ? 'Promotion by ContrataCR' : 'Difusión de ContrataCR'}</h3>{rows.map(row => <div key={row.id} className="space-y-1 text-sm"><p className="font-semibold text-[#162543]">{{ instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' }[row.channel]} · {new Date(row.occurredOn + 'T12:00:00Z').toLocaleDateString(en ? 'en-US' : 'es-CR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</p><p className="text-[#68778d]">{row.paid ? (en ? 'Paid promotion by ContrataCR' : 'Promocionada por ContrataCR · Anuncio pagado') : (en ? 'Shared on social media' : 'Compartida en redes')}</p><a href={row.publishedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-[#0089bb]">{en ? 'View post' : 'Ver publicación'}<ExternalLink className="h-4 w-4"/></a></div>)}{rows.length < total && <button type="button" className="min-h-11 font-semibold text-[#0089bb]" disabled={loading} onClick={() => { setLoading(true); setPage(page + 1); }}>{en ? 'See more' : 'Ver más'}</button>}</section>;
}
