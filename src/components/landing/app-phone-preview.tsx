import Image from "next/image";

/** A straight-on product mockup preserves the real capture without warping it. */
export function AppPhonePreview() {
  return <div className="relative mx-auto w-[258px] rounded-[35px] border-[3px] border-[#009FD9] bg-[#141418] p-[6px] shadow-[0_28px_65px_rgba(0,0,0,0.45)]" data-testid="app-phone-screen">
    <div aria-hidden="true" className="absolute -left-[3px] top-24 h-9 w-[3px] rounded-l bg-[#141418]" />
    <div aria-hidden="true" className="absolute -right-[3px] top-32 h-14 w-[3px] rounded-r bg-[#141418]" />
    <div className="overflow-hidden rounded-[26px] bg-white ring-2 ring-black">
      <div aria-hidden="true" className="absolute inset-x-0 top-[6px] flex h-[5px] items-start justify-center"><span className="h-[5px] w-[70px] rounded-b-xl bg-[#141418]" /></div>
      <Image src="/stores/app-home-20261013.jpg" width={588} height={1278} sizes="242px" alt="" className="block h-auto w-full" />
      <div aria-hidden="true" className="flex h-4 items-center justify-center bg-white"><span className="h-[3px] w-20 rounded-full bg-slate-900" /></div>
    </div>
  </div>;
}
