import Image from "next/image";

export function AppSection() {
  return (
    <section className="relative h-[400px] sm:h-[480px] overflow-hidden flex items-center justify-center">
      {/* Background photo */}
      <Image
        src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1800&q=80"
        alt="App ContrataCR"
        fill
        className="object-cover"
        sizes="100vw"
        priority={false}
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-[#1a2744]/70" />

      {/* Content */}
      <div className="relative z-10 text-center px-4">
        <p className="text-[#93C5FD] text-sm font-bold uppercase tracking-widest mb-3">
          Muy pronto
        </p>
        <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 leading-tight">
          La app móvil está en camino.
        </h2>
        <p className="text-white/60 text-base sm:text-lg mb-8 max-w-md mx-auto">
          Contratá profesionales desde tu celular en segundos. Disponible muy pronto.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          {[
            { store: "App Store", icon: AppleIcon },
            { store: "Google Play", icon: GooglePlayIcon },
          ].map(({ store, icon: Icon }) => (
            <button
              key={store}
              disabled
              className="flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-white/10 border border-white/20 text-white cursor-not-allowed opacity-70 backdrop-blur-sm"
            >
              <Icon />
              <div className="text-left">
                <p className="text-[10px] text-white/60 leading-none">Próximamente</p>
                <p className="text-sm font-semibold leading-tight">{store}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function AppleIcon() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
    </svg>
  );
}

function GooglePlayIcon() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.18 23.76c.3.16.64.18.96.06l13.5-7.74-2.94-2.94-11.52 10.62zM.54 1.62C.2 1.98 0 2.54 0 3.24v17.52c0 .7.2 1.26.54 1.62L.66 22.5 12.42 10.74v-.3L.66 1.5l-.12.12zM20.52 9.12l-2.88-1.68-3.24 3.24 3.24 3.24 2.94-1.68c.84-.48.84-1.26-.06-1.8v-.02zM4.14.24L17.64 7.98l-2.94 2.94L3.18.24c.3-.12.66-.14.96 0z"/>
    </svg>
  );
}
