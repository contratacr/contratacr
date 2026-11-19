'use client';

import {useEffect, useRef, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {isValidId} from '@/lib/cedula';
import {Link} from '@/i18n/navigation';
import type {FiscalReceiver} from '@/lib/pro/client-fiscal';

const types = {cedula: 'individual', juridica: 'company', dimex: 'dimex', nite: 'nite'} as const;
type Match = {name: string; identificationType: typeof types[keyof typeof types]};
type Result = {key: string; status: 'loading' | 'found' | 'missing' | 'unavailable' | 'limited' | 'applied'; match?: Match};

/** Explicit lookup and application: never silently replace a saved receiver. */
export function FiscalIdentityLookup({value, onChange}: {
  value: Partial<FiscalReceiver>;
  onChange: (value: Partial<FiscalReceiver>) => void;
}) {
  const t = useTranslations('proIdentityLookup');
  const id = (value.identification ?? '').replace(/[\s-]/g, '');
  const key = JSON.stringify([id, value.identificationType ?? '']);
  const [result, setResult] = useState<Result | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => {request.current?.abort(); request.current = null;}, [key]);
  const current = result?.key === key ? result : null;
  const supported = value.identificationType !== 'foreign';
  const valid = supported && isValidId(id);

  async function lookup() {
    if (!valid || current?.status === 'loading') return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setResult({key, status: 'loading'});
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/api/pro/identity-lookup', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identification:id,purpose:'client_billing'}),cache: 'no-store', signal: controller.signal});
      if (request.current !== controller || controller.signal.aborted) return;
      if (!response.ok) {
        setResult({key, status: response.status === 404 ? 'missing' : response.status === 429 ? 'limited' : 'unavailable'});
        return;
      }
      const body = await response.json();
      if (request.current !== controller || controller.signal.aborted) return;
      const name = typeof body.fullName === 'string' ? body.fullName.trim() : '';
      const type = typeof body.idType === 'string' && Object.hasOwn(types, body.idType) ? types[body.idType as keyof typeof types] : null;
      if (!body.found || !name || name.length > 160 || !type) {
        setResult({key, status: 'unavailable'});
        return;
      }
      setResult({key, status: 'found', match: {name, identificationType: type}});
    } catch {
      if (request.current === controller) setResult({key, status: 'unavailable'});
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = null;
    }
  }

  function apply() {
    if (!current?.match || current.status !== 'found') return;
    const match = current.match;
    onChange({...value, name: match.name, identificationType: match.identificationType});
    setResult({key: JSON.stringify([id, match.identificationType]), status: 'applied'});
  }

  return <div className="space-y-2">
    {supported && <Button type="button" variant="secondary" className="min-h-11 max-w-full whitespace-normal" disabled={!valid || current?.status === 'loading'} onClick={() => void lookup()}>{current?.status === 'loading' ? t('loading') : t('lookup')}</Button>}
    <p className="text-xs text-[#68778d]">{supported ? t('hint') : t('foreign')}</p>
    {supported&&<details className="text-xs text-[#68778d]"><summary className="min-h-8 cursor-pointer font-semibold">{t('privacyTitle')}</summary><p className="mt-2">{t('privacyNotice')}</p><Link href="/privacidad" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block underline">{t('privacyLink')}</Link></details>}
    {current && current.status !== 'found' && <p role="status" className="text-sm text-[#52627a]">{t(current.status)}</p>}
    {current?.status === 'found' && current.match && <div role="status" className="space-y-2 rounded-xl border border-[#d7e1ea] bg-[#f3f8fb] p-3">
      <p className="text-sm font-semibold">{t('result')}</p>
      <p className="break-words">{current.match.name}</p>
      <p className="text-sm">{t(`types.${current.match.identificationType}`)}</p>
      <p className="text-xs text-[#68778d]">{t('review')}</p>
      <Button type="button" variant="secondary" className="min-h-11 max-w-full whitespace-normal" onClick={apply}>{t('apply')}</Button>
    </div>}
  </div>;
}
