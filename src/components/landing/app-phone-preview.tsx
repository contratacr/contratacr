import Image from "next/image";

/** A straight-on product mockup preserves the real capture without warping it. */
export function AppPhonePreview() {
  return <div className="relative mx-auto w-[258px] rounded-[42px] border border-slate-500 bg-gradient-to-br from-slate-500 via-slate-900 to-black p-[7px] shadow-[0_28px_65px_rgba(0,0,0,0.45)]" data-testid="app-phone-screen">
    <div aria-hidden="true" className="absolute -left-[3px] top-24 h-9 w-[3px] rounded-l bg-slate-500" />
    <div aria-hidden="true" className="absolute -right-[3px] top-32 h-14 w-[3px] rounded-r bg-slate-500" />
    <div className="overflow-hidden rounded-[34px] bg-white ring-2 ring-black">
      <div aria-hidden="true" className="flex h-6 items-center justify-center bg-white"><span className="h-[5px] w-12 rounded-full bg-slate-900" /></div>
      <Image src="/guia/profesionales.jpg" width={588} height={1278} sizes="242px" alt="" className="block h-auto w-full" />
      <div aria-hidden="true" className="flex h-4 items-center justify-center bg-white"><span className="h-[3px] w-20 rounded-full bg-slate-900" /></div>
    </div>
  </div>;
}
