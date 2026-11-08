import { Unzip, UnzipInflate, strFromU8 } from 'fflate';
export const MAX_CV_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 80000;
const MAX_XML = 1024 * 1024;
export class CvReadError extends Error {
  constructor(public code: 'format' | 'size' | 'unreadable' | 'protected' | 'pages' | 'timeout') { super(code); }
}
export async function readCvFile(file: File): Promise<string> {
  if (!file.size || file.size > MAX_CV_BYTES) throw new CvReadError('size');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'pdf' && extension !== 'docx') throw new CvReadError('format');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let result: string;
  if (extension === 'docx') {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new CvReadError('format');
    // Stream only document.xml, bounding actual inflated bytes, not ZIP metadata.
    let xml = ''; let total = 0; let seen = false;
    const zip = new Unzip(entry => {
      if (entry.name !== 'word/document.xml') return;
      if (seen || (entry.originalSize ?? 0) > MAX_XML) throw new CvReadError('size');
      seen = true;
      const chunks: Uint8Array[] = [];
      entry.ondata = (error, data, final) => {
        if (error) throw new CvReadError('unreadable');
        total += data.length;
        if (total > MAX_XML) { entry.terminate(); throw new CvReadError('size'); }
        chunks.push(data);
        if (final) { const joined = new Uint8Array(total); let at = 0; for (const chunk of chunks) { joined.set(chunk, at); at += chunk.length; } xml = strFromU8(joined); }
      };
      entry.start();
    });
    zip.register(UnzipInflate);
    for (let offset = 0; offset < bytes.length; offset += 1024) zip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
    if (!xml || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new CvReadError('unreadable');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new CvReadError('unreadable');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    result = Array.from(doc.getElementsByTagNameNS(ns, 'p')).map(p => Array.from(p.getElementsByTagNameNS(ns, 't')).map(t => t.textContent || '').join('')).join('\n');
  } else {
    if (!new TextDecoder().decode(bytes.slice(0, 5)).startsWith('%PDF-')) throw new CvReadError('format');
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker-6.5.438.min.mjs';
    const task = pdfjs.getDocument({ data: bytes, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
    // Password dialog deliberately omitted: the owner can export an unprotected copy.
    let rejectPassword: (error: Error) => void = () => {};
    const protectedFile = new Promise<never>((_, reject) => { rejectPassword = reject; });
    task.onPassword = () => { rejectPassword(new CvReadError("protected")); };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      result = await Promise.race([
        protectedFile,
        (async () => {
          const pdf = await task.promise;
          if (pdf.numPages > 15) throw new CvReadError('pages');
          let output = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            output += content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('') + '\n\n';
            page.cleanup();
            if (output.length > MAX_TEXT) throw new CvReadError('size');
          }
          return output;
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new CvReadError('timeout')); void task.destroy(); }, 20000); }),
      ]);
    } finally { clearTimeout(timer); await task.destroy(); }
  }
  if (result.length > MAX_TEXT) throw new CvReadError('size');
  if (result.trim().length < 20) throw new CvReadError('unreadable');
  return result;
}
