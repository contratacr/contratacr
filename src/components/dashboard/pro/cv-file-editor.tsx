'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, Trash2, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilaInterruptor } from '@/components/ui/fila-interruptor';
export type CvFileMetadata = { name: string; visible: boolean; version: string };
export function CvFileEditor({ professionalId, selectedFile, english, onChoose, onCancel, reading = false }: { professionalId: string; selectedFile: File | null; english: boolean; onChoose: () => void; onCancel: () => void; reading?: boolean }) {
  const endpoint = `/api/professional-cv?professionalId=${encodeURIComponent(professionalId)}`;
  const [file, setFile] = useState<CvFileMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
    setBusy(true); setError('');
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
      if (method === 'DELETE') { setLastUploaded(null); onCancel(); }
    } catch (e) { setError(e instanceof Error ? e.message : (english ? 'Could not save.' : 'No se pudo guardar.')); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-3" data-cv-sharing>
    {loading && <p role="status" className="text-sm text-[#68778d]">{english ? 'Checking CV…' : 'Consultando CV…'}</p>}
    {!loading && !file && !pending && <Button type="button" className="min-h-11" disabled={reading || busy} onClick={onChoose}><Upload size={16}/>{english ? 'Upload CV' : 'Subir CV'}</Button>}
    {file && <>
      <div className="grid grid-cols-2 gap-2">
        <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#c9dce8] bg-white px-4 text-sm font-semibold text-[#0089bb]" href={endpoint} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{english ? 'View CV' : 'Ver CV'}</a>
        <Button type="button" variant="outline" className="min-h-11 bg-white" disabled={busy || reading} onClick={onChoose}><RefreshCw size={16}/>{english ? 'Change CV' : 'Cambiar CV'}</Button>
      </div>
      <div className="border-t border-[#c9e7f2] pt-3">
        <FilaInterruptor titulo={english ? 'Show on my profile' : 'Mostrar en mi perfil'} disabled={loading || busy} checked={file.visible} onChange={visible => void save('PATCH', visible)}/>
      </div>
      <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-medium text-[#a12828] disabled:opacity-50" disabled={busy} onClick={() => void save('DELETE')}><Trash2 size={16}/>{english ? 'Remove CV' : 'Retirar CV'}</button>
    </>}
    {pending && <div className="space-y-3 rounded-xl border border-[#c9e7f2] bg-white p-3">
      <p className="break-all text-sm font-medium text-[#162543]">{selectedFile.name}</p>
      <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={busy || reading || loading} onClick={() => void save('POST')}><Upload size={16}/>{file ? (english ? 'Replace and show CV' : 'Reemplazar y mostrar CV') : (english ? 'Attach and show CV' : 'Adjuntar y mostrar CV')}</Button><Button type="button" variant="ghost" className="min-h-11" disabled={busy || reading} onClick={onCancel}>{english ? 'Cancel' : 'Cancelar'}</Button></div>
    </div>}
    {(busy || reading) && <p role="status" className="text-xs text-[#68778d]">{reading ? (english ? 'Reading CV…' : 'Leyendo CV…') : (english ? 'Saving CV…' : 'Guardando CV…')}</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>;
}
