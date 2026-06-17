"use client";

import { useState } from "react";

// Avatar for the "Así funciona" phone mockup cards. Shows a profile PHOTO when
// `src` is given; if it's missing or fails to load (e.g. the local sgimage hasn't
// been added to /public yet) it gracefully falls back to the brand initials circle,
// so the mockup never shows a broken-image icon.
export function MockAvatar({ src, initials }: { src?: string; initials: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="h-11 w-11 rounded-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="grid h-11 w-11 place-items-center rounded-full bg-[#EBF5FB] text-[12px] font-extrabold text-[#009FD9]">
      {initials}
    </div>
  );
}
