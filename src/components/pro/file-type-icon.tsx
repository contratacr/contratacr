import {File,FileImage,FileSpreadsheet,FileText,FileVideo,Presentation,Ruler} from 'lucide-react';
import {PRO_DOC_FORMATS,isProDocMime,proDocBadge} from '@/lib/pro/file-formats';

/**
 * Ronda F2-E (row 28): one icon and one color per kind of file (photo, PDF, Word, spreadsheet, slides, text, CAD, video), shared by the
 * job files and the company library so the same file looks the same everywhere. The extension is printed under the icon.
 */
const TONES:Record<string,{box:string;Icon:typeof File}>={
 image:{box:'bg-[#e8f6fc] text-[#006c8f]',Icon:FileImage},
 pdf:{box:'bg-[#fdecec] text-[#b42318]',Icon:FileText},
 word:{box:'bg-[#e8f1fb] text-[#1d4f91]',Icon:FileText},
 sheet:{box:'bg-[#e7f6ee] text-[#175b42]',Icon:FileSpreadsheet},
 slides:{box:'bg-[#fff1e6] text-[#a04a00]',Icon:Presentation},
 text:{box:'bg-[#f1f3f6] text-[#415065]',Icon:FileText},
 cad:{box:'bg-[#f3ecfb] text-[#6b3fa0]',Icon:Ruler},
 video:{box:'bg-[#ede9fe] text-[#5b3cc4]',Icon:FileVideo},
};
export function proFileKind(mime:string){return isProDocMime(mime)?PRO_DOC_FORMATS[mime].kind:'other';}
export function FileTypeIcon({mimeType,className='h-14 w-14'}:{mimeType:string;className?:string}){
 const kind=proFileKind(mimeType),tone=TONES[kind]??{box:'bg-[#f1f3f6] text-[#415065]',Icon:File},Icon=tone.Icon;
 return <span aria-hidden data-file-type-icon={kind} className={`flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg ${tone.box} ${className}`}><Icon className="h-6 w-6"/><span className="text-[10px] font-bold leading-none">{proDocBadge(mimeType)}</span></span>;
}
