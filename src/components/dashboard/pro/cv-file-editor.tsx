'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FilaInterruptor } from '@/components/ui/fila-interruptor';
export type CvFileMetadata = { name: string; visible: boolean; version: string };
export function CvFileEditor({ professionalId, selectedFile, english }: { professionalId: string; selectedFile: File | null; english: boolean }) {
  const endpoint = `/api/professional-cv?professionalId=${encodeURIComponent(professionalId)}`;
  const [file, setFile] = useState<CvFileMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastUploaded, setLastUploaded] = useState<File | null>(null);
  const pending = selectedFile && selectedFile !== lastUploaded;
  useEffect(() => {
    const abort = new AbortController();
    fetch(`${endpoint}&metadata=1`, { cache: 'no-store', signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('load');
      const data = await response.json(); setFile(data.file); setLoading(false);
    }).catch(() => { if (!abort.signal.aborted) { setError(english ? 'Could not check your shared CV. Reopen this section to retry.' : 'No pudimos consultar tu CV compartido. Volvé a abrir esta sección.'); setLoading(false); } });
    return () => abort.abort();
  }, [endpoint, english]);
  async function save(method: 'POST' | 'PATCH' | 'DELETE', visible?: boolean) {
    if (busy || loading) return;
    setBusy(true); setError(''); setNotice('');
    try {
      let body: FormData | string;
      if (method === 'POST') {
        if (!selectedFile) return;
        const data = new FormData(); data.set('file', selectedFile); data.set('share', 'true'); data.set('version', file?.version || ''); body = data;
      } else body = JSON.stringify({ version: file?.version, visible });
      const response = await fetch(endpoint, { method, body, ...(typeof body === 'string' ? { headers: { 'Content-Type': 'application/json' } } : {}) });
      const data = await response.json();
      if (!response.ok) throw new Error(english ? 'Could not save the CV change. Reopen this section and try again.' : data.error || 'No se pudo guardar el cambio.');
      setFile(data.file);
      if (method === 'POST') setLastUploaded(selectedFile);
      setNotice(english ? 'CV settings saved.' : 'Configuración del CV guardada.');
    } catch (e) { setError(e instanceof Error ? e.message : (english ? 'Could not save.' : 'No se pudo guardar.')); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-3 border-t border-[#c9e7f2] pt-4" data-cv-sharing>
    <fieldset disabled={loading || busy || (!file && !selectedFile)}>
      <FilaInterruptor titulo={english ? 'Show my CV on my profile' : 'Mostrar mi CV en el perfil'} ayuda={english ? 'Visitors can open and download the document.' : 'Los visitantes podrán abrir y descargar el documento.'} checked={file?.visible ?? false} onChange={visible => void save(file ? 'PATCH' : 'POST', visible)}/>
    </fieldset>
    {loading && <p role="status" className="text-xs text-[#68778d]">{english ? 'Checking CV…' : 'Consultando CV…'}</p>}
    {!loading && !file && !selectedFile && <p className="text-xs text-[#68778d]">{english ? 'Choose a CV above to share it.' : 'Elegí un CV arriba para compartirlo.'}</p>}
    {file && <div className="flex flex-wrap items-center gap-3">
      <a className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0089bb] underline" href={endpoint} target="_blank" rel="noopener noreferrer">{english ? 'View CV' : 'Ver CV'}</a>
      {pending && <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void save('POST')}>{english ? 'Replace and share CV' : 'Reemplazar y mostrar CV'}</Button>}
      <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={() => void save('DELETE')}>{english ? 'Remove CV' : 'Retirar CV'}</Button>
    </div>}
    {busy && <p role="status" className="text-xs text-[#68778d]">{english ? 'Saving CV…' : 'Guardando CV…'}</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="text-xs text-[#0089bb]">{notice}</p>}
  </div>;
}
