"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

type FaqItem = {
  question: string;
  answer: string;
};

export function ComoFuncionaFaq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
      {items.map((item, i) => (
        <div key={item.question} className={i === 0 ? "" : "border-t border-[#eef2f7]"}>
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[#f8fafc]"
            aria-expanded={open === i}
          >
            <span className="text-sm font-bold text-[#162543] sm:text-base">{item.question}</span>
            <ChevronDown className={`h-5 w-5 shrink-0 text-[#9ca3af] transition-transform ${open === i ? "rotate-180 text-[#009FD9]" : ""}`} />
          </button>
          {open === i && (
            <p className="px-5 pb-5 text-sm leading-relaxed text-[#6b7280]">{item.answer}</p>
          )}
        </div>
      ))}
    </div>
  );
}
