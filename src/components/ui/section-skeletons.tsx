import { cn } from "@/lib/utils";

// El esqueleto del panel: lo usa la propia pantalla mientras resuelve sesión y
// datos, no una frontera de ruta. Las rutas ya no tienen pantalla de carga —
// al navegar se mantiene la pantalla actual hasta que la nueva está lista.

function Hueso({ className }: { className: string }) {
  return <span aria-hidden className={cn("ccr-delayed-loading ccr-skeleton-shimmer block", className)} />;
}

// Barra superior a la altura del encabezado real, para que no salte al llegar.
function BarraSuperior() {
  return (
    <div className="flex h-16 items-center gap-3 bg-white px-4">
      <Hueso className="h-9 w-9 rounded-xl" />
      <Hueso className="h-5 w-36 rounded-full" />
      <span className="flex-1" />
      <Hueso className="h-9 w-9 rounded-full" />
    </div>
  );
}

// Panel: la tarjeta de perfil y la lista de tarjetas de sección.
export function PanelSkeleton() {
  return (
    <div className="min-h-screen bg-[#f4f7fa]" aria-busy="true" role="status">
      <BarraSuperior />
      {/* Hasta 1023px: la forma del teléfono (una columna). De 1024px en
          adelante: la forma REAL del panel de escritorio —tarjeta de cabecera
          a lo ancho, columna de navegación de 260px y la tarjeta de contenido—.
          Antes el esqueleto era siempre el del teléfono, y en la computadora
          aparecía una columna angosta que luego saltaba al acomodo ancho. */}
      <div className="mx-auto w-full max-w-xl space-y-4 px-4 pt-4 lg:max-w-7xl lg:px-8 lg:pt-8">
        <div className="rounded-[22px] border border-[#e5edf4] bg-white p-5 shadow-[0_12px_34px_-28px_rgba(15,23,42,0.55)] lg:max-w-[71.5rem]">
          <div className="flex items-center gap-4">
            <Hueso className="h-16 w-16 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <Hueso className="h-5 w-40 rounded-full" />
              <Hueso className="h-3.5 w-32 rounded-full" />
            </div>
            <Hueso className="hidden h-11 w-40 rounded-full lg:block" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:hidden">
            <Hueso className="h-11 rounded-full" />
            <Hueso className="h-11 rounded-full" />
          </div>
        </div>
        <div className="lg:flex lg:items-start lg:gap-5">
          <div className="space-y-2.5 lg:w-[260px] lg:shrink-0 lg:rounded-[22px] lg:border lg:border-[#e5edf4] lg:bg-white lg:p-3 lg:space-y-1">
            {[0, 1, 2, 3, 4, 5].map((fila) => (
              <div key={fila} className="flex min-h-[60px] items-center gap-3 rounded-2xl border border-[#e5edf4] bg-white px-4 shadow-[0_10px_26px_-24px_rgba(15,23,42,0.55)] lg:min-h-[44px] lg:border-0 lg:px-3 lg:shadow-none">
                <Hueso className="h-8 w-8 shrink-0 rounded-full lg:h-5 lg:w-5" />
                <Hueso className={cn("h-4 rounded-full", ["w-40", "w-32", "w-44", "w-36", "w-40", "w-32"][fila])} />
              </div>
            ))}
          </div>
          <div className="hidden min-w-0 flex-1 lg:block lg:max-w-[54rem]">
            <div className="overflow-hidden rounded-[22px] border border-[#e5edf4] bg-white">
              <div className="border-b border-[#eef3f7] px-6 py-4"><Hueso className="h-5 w-36 rounded-full" /></div>
              <div className="space-y-3 p-6">
                {[0, 1, 2].map((fila) => (
                  <div key={fila} className="flex items-start gap-3 rounded-2xl border border-[#dfe8f0] p-5">
                    <Hueso className="h-11 w-11 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <Hueso className="h-4 w-2/3 rounded-full" />
                      <Hueso className="h-3 w-1/2 rounded-full" />
                      <Hueso className="h-3 w-5/6 rounded-full" />
                    </div>
                    <Hueso className="h-9 w-9 shrink-0 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Detalle de una publicación (oferta, empleo): imagen grande, título, precio

// Lienzo neutro: el fondo de la app con la franja de la cabecera. Lo usan las
// pantallas que resuelven datos por su cuenta y antes pintaban la marca de
// carga; dentro de la app la marca es solo del arranque en frío.
export function LienzoNeutro() {
  return (
    <div className="min-h-screen bg-[#f4f7fa]" aria-hidden>
      <div className="h-16 bg-white shadow-[0_1px_0_#e5e7eb]" />
    </div>
  );
}

// Perfil de profesional: foto, nombre, acciones y sus tarjetas. Se usa mientras
// llegan los datos —también en un arranque en frío, cuando el caché de sesión
// ya no existe— en vez de un lienzo vacío.
export function PerfilSkeleton() {
  return (
    <div className="min-h-screen bg-[#f4f7fa]" aria-busy="true" role="status">
      <div className="h-16 bg-white shadow-[0_1px_0_#e5e7eb]" />
      <div className="bg-white px-4 pb-5 pt-5">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4">
          <Hueso className="h-20 w-20 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Hueso className="h-5 w-48 max-w-full rounded-full" />
            <Hueso className="h-3.5 w-36 max-w-full rounded-full" />
            <Hueso className="h-3.5 w-28 max-w-full rounded-full" />
          </div>
        </div>
        <div className="mx-auto mt-4 grid w-full max-w-3xl grid-cols-2 gap-2">
          <Hueso className="h-11 rounded-full" />
          <Hueso className="h-11 rounded-full" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pt-4">
        {[0, 1, 2].map((fila) => (
          <div key={fila} className="rounded-2xl border border-[#e5edf4] bg-white p-4">
            <Hueso className="h-4 w-40 max-w-full rounded-full" />
            <div className="mt-3 space-y-2">
              <Hueso className="h-3 w-full rounded-full" />
              <Hueso className="h-3 w-5/6 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
