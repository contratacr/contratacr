const ITEMS = [
  "Cédula verificada",
  "Contacto por WhatsApp",
  "Sin intermediarios",
  "Solo en Costa Rica",
  "Profesionales reales",
  "100% gratis buscar",
  "Disponibles en tu cantón",
  "Perfiles con reseñas",
];

const DOUBLED = [...ITEMS, ...ITEMS];

export function MarqueeStrip() {
  return (
    <div className="bg-[#1a2744] py-4 overflow-hidden select-none">
      <div className="flex animate-marquee-infinite" style={{ width: "max-content" }}>
        {DOUBLED.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-5 shrink-0"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0" />
            <span className="text-white/80 text-sm font-medium whitespace-nowrap">
              {item}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
