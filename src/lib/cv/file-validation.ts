import { Unzip, UnzipInflate } from 'fflate';
export const CV_BUCKET = 'professional-cvs';
export const CV_FILE_MAX = 5 * 1024 * 1024;
export const CV_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Validate content, not user-supplied MIME. Never render Office HTML or follow relationships. */
export function cvFileType(bytes: Uint8Array, filename: string): { extension: 'pdf' | 'docx'; mime: string } {
  if (!bytes.length || bytes.length > CV_FILE_MAX) throw new Error('Usá un CV de hasta 5 MB.');
  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension === 'pdf' && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-') return { extension, mime: 'application/pdf' };
  if (extension !== 'docx' || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Elegí un PDF o DOCX válido.');
  let document = false, contentTypes = false, entries = 0, total = 0;
  const zip = new Unzip(entry => {
    if (++entries > 500 || /(?:^|\/)(?:vbaProject|embeddings|activeX)(?:[/.]|$)/i.test(entry.name)) throw new Error('Este documento contiene elementos no admitidos. Exportalo como PDF.');
    if (entry.name !== 'word/document.xml' && entry.name !== '[Content_Types].xml') return;
    if ((entry.originalSize ?? 0) > 1024 * 1024) throw new Error('El documento es demasiado grande.');
    if (entry.name === 'word/document.xml') { if (document) throw new Error('Documento inválido.'); document = true; }
    else { if (contentTypes) throw new Error('Documento inválido.'); contentTypes = true; }
    const chunks: Uint8Array[] = [];
    entry.ondata = (error, bytes, final) => {
      if (error) throw new Error('No se pudo leer el documento.');
      total += bytes.length;
      if (total > 1024 * 1024) { entry.terminate(); throw new Error('El documento es demasiado grande.'); }
      chunks.push(bytes);
      if (final) {
        const xml = chunks.map(chunk => new TextDecoder().decode(chunk)).join('');
        if (/<!DOCTYPE|<!ENTITY|macroEnabled|vbaProject/i.test(xml)) throw new Error('Documento no admitido.');
        if (entry.name === 'word/document.xml' && !xml.includes('wordprocessingml/2006/main')) throw new Error('DOCX inválido.');
        if (entry.name === '[Content_Types].xml' && !xml.includes('wordprocessingml.document.main+xml')) throw new Error('DOCX inválido.');
      }
    };
    entry.start();
  });
  zip.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += 1024) zip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
  if (!document || !contentTypes) throw new Error('DOCX inválido.');
  return { extension: 'docx', mime: CV_DOCX_MIME };
}
