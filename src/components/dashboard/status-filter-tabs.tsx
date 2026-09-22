"use client";

import { FlechasDeCarril } from "@/components/ui/flechas-de-carril";
import { useEffect, useRef, useState } from "react";
import { useDesvanecidoDeCarril } from "@/hooks/use-desvanecido-de-carril";
import { usePantallaAngosta } from "@/hooks/use-pantalla-angosta";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ScrollRail } from "@/components/ui/scroll-rail";

// Segmented groups are a grid; rails scroll and hint the overflow with a chevron.
//
// `conFlechas`: en computadora la flecha vive en un MARGEN propio, no encima
// del carril. Sin eso quedaba medio botón sobre la última opción y le tapaba
// el final del rótulo («Consultoría T▸»), justo la opción que viene a
// anunciar. Con margen se ve la flecha Y se lee la opción entera.
function RailOrGrid({ scroll, className, children }: { scroll: boolean; className: string; children: React.ReactNode }) {
  return scroll ? <ScrollRail className={className} asomoMinimo={64} conFlechas>{children}</ScrollRail> : <div className={className}>{children}</div>;
}

// Shared pill status-filter tabs — used identically in the client and professional
// panels for solicitudes AND proyectos so both feel the same. The SAME four buckets
// El ritmo es el mismo en toda la app —esperando → trabajando → cerrado— pero
// cada pantalla nombra su primer paso con la palabra que le corresponde
// (Enviadas, Publicados). Las solicitudes se auto-confirman, así que ahí no hay
// paso de espera: solo En curso y Finalizadas. Lo terminado y lo cancelado
// comparten pestaña; la tarjeta dice cuál de los dos fue.
// `id` doubles as the statusTabs i18n key, so labels translate per locale.
export type FilterTab = { id: string };

/**
 * Con pocos elementos las ETAPAS estorban más de lo que ayudan: la lista cabe
 * entera en pantalla y se lee de un vistazo. Medido en producción: había tres
 * pestañas («Activas / Finalizadas / Canceladas») encima de UN solo proyecto.
 *
 * Ojo: esto vale para etapas —momentos de una misma cosa—, NO para tipos.
 * «Profesionales / Promociones / Empleos» en Favoritos no son etapas: son cosas
 * distintas, y esconderlas revuelve tres listas en una. Los tipos se dibujan
 * siempre, con su conteo, que además dice qué hay sin tener que bajar.
 */
export const UMBRAL_SIN_FILTROS = 5;
export function sinFiltros(total: number) {
  return total <= UMBRAL_SIN_FILTROS;
}

/**
 * Las etapas se nombran de acuerdo con lo que se filtra: «Activas / Cerradas»
 * para promociones, citas o propuestas, pero «Activos / Cerrados» para
 * proyectos y empleos. Las claves son las mismas —los grupos son los mismos—;
 * lo que cambia es el rótulo. Antes Mis proyectos decía «Finalizadas» y
 * «Canceladas», y Mis empleos «Cerradas».
 */
const EN_MASCULINO: Record<string, string> = {
  activas: "activos",
  finalizadas: "finalizados",
  canceladas: "cancelados",
  cerradas: "cerrados",
};
export function etapaEnMasculino(id: string) {
  return EN_MASCULINO[id] ?? id;
}

export function StatusFilterTabs({
  tabs,
  value,
  onChange,
  counts,
  labelFor,
  dotFor,
  variant = "underline",
  mobileLayout = "equal",
  totalElementos,
  limpiable = true,
  masculino = false,
  siempreCarril = false,
}: {
  tabs: readonly FilterTab[];
  value: string;
  onChange: (id: string) => void;
  /** Per-filter item counts → rendered as a small badge after the label (sprint 479,
   *  owner reference image). Only shown in the "underline" variant when count > 0. */
  counts?: Record<string, number>;
  /** Custom label per tab id (else the `statusTabs` i18n key is used). */
  labelFor?: (id: string) => string;
  /** Show a small "needs attention" red dot on a tab (e.g. an unread reply). */
  dotFor?: (id: string) => boolean;
  /**
   * CUÁNDO PONER UN NÚMERO. Un número dentro de una pastilla se lee como «hay
   * algo nuevo»: es el lenguaje de los avisos. Por eso va solo donde significa
   * ALGO QUE ATENDER —casos de soporte abiertos, respuestas sin ver—, no para
   * decir cuántas cosas hay guardadas. En Favoritos o en el filtro por servicio
   * el número no le servía a nadie, y de paso ensanchaba las pestañas 72 px, que
   * es lo que dejaba la última cortada a un hilo del borde.
   */
  /** "underline" (default) = status tabs with count badges; "pills" = filter chips
   *  (e.g. the profession filter), no counts; "chips" = small outlined pills on a
   *  rail, for a FILTER that sits near a segmented view switcher and must not
   *  look like a second one. */
  variant?: "underline" | "pills" | "chips";
  /** Short status labels can share the available mobile width evenly. Long,
   * dynamic labels (such as professions) wrap into complete, visible rows. */
  mobileLayout?: "scroll" | "wrap" | "equal";
  /** Total de elementos de la lista. Con pocos, las ETAPAS no se dibujan y la
   *  lista se muestra entera (ver `sinFiltros`). */
  totalElementos?: number;
  /** En un filtro, volver a tocar la opción activa la quita. En un cambiador de
   *  vista eso no significa nada: se pasa `false` y siempre queda una elegida. */
  limpiable?: boolean;
  /** Lo que se filtra es masculino (proyectos, empleos): «Activos», «Cerrados». */
  masculino?: boolean;
  /**
   * La misma pastilla de Favoritos, pero SIEMPRE en carril: cada opción a su
   * ancho, y se desliza a la derecha cuando no caben. Para listas abiertas como
   * los servicios de un profesional (pueden ser 15), donde repartir el ancho
   * dejaría «Reparación de comput…».
   */
  siempreCarril?: boolean;
}) {
  const tr = useTranslations("statusTabs");
  const pocos = totalElementos != null && sinFiltros(totalElementos);
  const pantallaAngosta = usePantallaAngosta();
  const label = (id: string) => (labelFor ? labelFor(id) : tr(masculino ? etapaEnMasculino(id) : id));
  // Al marcar una etapa, el carril se corre para mostrarla entera y dejar
  // asomando a su vecina: así al tocar la tercera aparece la cuarta, y al
  // volver a la primera se ve que no hay nada antes. El margen es lo que hace
  // que asome: sin él la etapa quedaba pegada al filo y parecía la última.
  const carrilRef = useRef<HTMLDivElement | null>(null);
  const carrilSegmentadoContenedor = useRef<HTMLDivElement | null>(null);
  // Chips: en computadora, con muchos servicios se pliegan tras «+N más».
  const [todosLosChips, setTodosLosChips] = useState(false);
  // Mismo degradado que el resto de los carriles del app: la etapa que asoma se
  // desvanece en el borde en vez de quedar cortada contra el filo.
  const { mascara: mascaraCarril } = useDesvanecidoDeCarril(carrilRef);
  useEffect(() => {
    const carril = carrilRef.current;
    if (!carril || carril.scrollWidth <= carril.clientWidth + 1) return;
    const activa = carril.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!activa) return;
    const caja = carril.getBoundingClientRect();
    const pastilla = activa.getBoundingClientRect();
    const margen = 40;
    const sobraDerecha = pastilla.right - (caja.right - margen);
    const faltaIzquierda = (caja.left + margen) - pastilla.left;
    if (sobraDerecha > 0) carril.scrollTo({ left: carril.scrollLeft + sobraDerecha, behavior: "smooth" });
    else if (faltaIzquierda > 0) carril.scrollTo({ left: Math.max(0, carril.scrollLeft - faltaIzquierda), behavior: "smooth" });
  }, [value]);
  // Con pocos elementos no hay nada que filtrar: la lista entera es más corta
  // que las pestañas que la ordenan.
  if (pocos && variant === "underline") return null;
  // Con una sola etapa no hay nada que elegir: un control con un botón miente.
  // Se resume en una línea, como hacen las listas que solo tienen un estado.
  if (tabs.length === 1 && variant === "underline") {
    const unica = tabs[0];
    const total = counts?.[unica.id] ?? 0;
    return (
      <p data-status-filter-tabs="" data-filter-layout="summary" className="px-1 text-[13px] font-semibold text-[#6b7280]">
        {label(unica.id)}
        {total > 0 && <span className="ml-1.5 font-extrabold text-[#162543]">{total}</span>}
      </p>
    );
  }
  const useSegmentedLayout = !siempreCarril && tabs.length >= 2 && tabs.length <= 5 && mobileLayout !== "scroll";
  const useScrollableLayout = !useSegmentedLayout;
  // Una celda segmentada es angosta en 320 px: con cuatro o más etapas el
  // conteo se apila bajo el rótulo para que ninguno se corte.
  // REGLA DEL APP: un filtro ocupa UNA sola línea, nunca dos. Cuando el rótulo
  // es largo no se parte en dos renglones —«Profesio / nales»—: la fila entera
  // pasa a deslizarse, con cada rótulo entero, igual que los filtros de
  // proyectos. De 640px en adelante vuelven a repartirse el ancho.
  // Cuántas letras caben sin apretar depende de cuántas celdas haya y de lo
  // ancha que sea la pantalla: con dos o tres celdas, un teléfono normal (360px
  // en adelante) da de sobra para un rótulo de catorce. En Favoritos,
  // «Profesionales» mide trece y caía al carril, así que las tres pestañas
  // salían de distinto ancho y el conjunto se veía torcido. Con cuatro o cinco
  // celdas, o en una pantalla de menos de 360px, el límite vuelve a doce y la
  // fila se desliza con los rótulos enteros.
  const cabenRotulosLargos = tabs.length <= 3 && !pantallaAngosta;
  const shortLabels = tabs.every((tab) => label(tab.id).length <= (cabenRotulosLargos ? 14 : 12));
  // CON DOS OPCIONES NO SE DESLIZA NUNCA.
  //
  // El carril existe para decir «hay más a la derecha». Con dos opciones esa
  // promesa es mentira: no hay una tercera, y lo único que se consigue es
  // cortar la segunda contra el filo. Así se veía el filtro de servicios
  // («Desarrollo web» / «Desarrollo de apps móviles»): dos opciones, una
  // partida. Con dos se reparte la fila a medias y el rótulo largo baja a un
  // segundo renglón —entero, sin cortar— porque la fila mide lo que midan sus
  // dos celdas y nada queda fuera de la pantalla. De tres en adelante sí vuelve
  // el carril: ahí sí hay algo que ir a buscar a la derecha.
  const dosOpciones = tabs.length === 2;
  const enDosRenglones = dosOpciones && !shortLabels;
  // Con cuatro o cinco etapas la celda es angosta: el conteo se queda a la
  // derecha del rótulo —como en el resto de la app— y lo que se aprieta es el
  // relleno, la separación y el tamaño del conteo, no la disposición.
  const compacto = useSegmentedLayout && !dosOpciones && (tabs.length >= 4 || !shortLabels);

  // PILLS — same segmented language, without count badges. Used for profession
  // filters where labels can be long; 2–4 fit the row, 5+ become a clean rail.
  // CHIPS — visually distinct from segmented sub-navs: small outlined pills,
  // active in light blue, with count badges, on a scrollable rail.
  if (variant === "chips") {
    // Con muchos servicios (un profesional puede tener 15), en computadora se
    // muestran los primeros y «+N más» despliega el resto: envueltos, 15 chips
    // eran tres filas antes de llegar a lo que filtran. El elegido se ve
    // siempre, aunque esté entre los plegados. En el teléfono no se pliega
    // nada: es un carril y el dedo lo recorre. Qué se esconde y cuándo lo
    // decide la regla del documento (data-ccr-carriles), con la misma
    // condición que envuelve los chips —pantalla ancha Y ratón—: en una
    // pantalla táctil ancha sigue siendo carril y ahí esconder no tendría
    // cómo volver.
    const LIMITE = 8;
    const hayDeMas = tabs.length > LIMITE;
    const plegar = hayDeMas && !todosLosChips;
    const siempreVisibles = new Set(tabs.slice(0, LIMITE - 1).map((tab) => tab.id));
    if (value) siempreVisibles.add(value);
    const plegados = tabs.filter((tab) => !siempreVisibles.has(tab.id)).length;
    const CHIP = "inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold transition-colors";
    return (
      <div data-status-filter-tabs="" data-filter-layout="chips" className="group/carril relative w-full max-w-full min-w-0 overflow-hidden">
        <FlechasDeCarril carril={carrilRef} />
        {/* EL DEGRADADO TAMBIÉN AQUÍ. Se calculaba (`mascaraCarril`) pero solo
            se aplicaba en la variante segmentada: estas pastillas se quedaban
            sin ninguna señal de que hay más a la derecha, porque las flechas
            son de computadora Y con el cursor encima. Con el dedo, el degradado
            es la única pista. Se mide antes de pintarse: si todo cabe, no sale. */}
        <div
          ref={carrilRef}
          style={{ maskImage: mascaraCarril, WebkitMaskImage: mascaraCarril }}
          className="ccr-carril-chips scrollbar-none flex gap-1.5 overflow-x-auto py-0"
        >
          {tabs.map((tab) => {
            const active = value === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(active && limpiable ? "" : tab.id)}
                aria-pressed={active}
                data-plegado={plegar && !siempreVisibles.has(tab.id) ? "" : undefined}
                className={cn(
                  // 36 px en todos lados, como el resto de los filtros. Eran 26 en
                  // el teléfono —pensados para ir sobre el mapa de /buscar, que ya
                  // no usa este control—: tamaño de etiqueta, chico para el dedo.
                  CHIP,
                  active
                    ? "border-[#009FD9] bg-[#009FD9] text-white"
                    : "border-[#e5e7eb] bg-white text-[#526277] hover:border-[#c3d2de]",
                )}
              >
                <span className="max-w-[14rem] truncate">{label(tab.id)}</span>
                {/* El conteo va en el chip: dice qué hay en cada tipo sin tener
                    que entrar a mirarlo. */}
                {typeof counts?.[tab.id] === "number" && (
                  <span className={cn("shrink-0 tabular-nums font-extrabold", active ? "text-white/90" : "text-[#8a98aa]")}>
                    {counts[tab.id]}
                  </span>
                )}
                {dotFor?.(tab.id) && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-white" : "bg-[#009FD9]")} aria-hidden />}
              </button>
            );
          })}
          {hayDeMas && (
            <button
              type="button"
              className={cn("ccr-ver-mas", CHIP, "border-dashed border-[#c3d2de] bg-white text-[#0089bb] hover:border-[#009FD9]")}
              onClick={() => setTodosLosChips((abiertos) => !abiertos)}
              aria-expanded={!plegar}
            >
              {plegar ? `+${plegados} ${tr("masServicios")}` : tr("menosServicios")}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === "pills") {
    const usePillSegmentedLayout = dosOpciones || (tabs.length <= 4 && shortLabels);
    return (
      <div
        data-status-filter-tabs=""
        data-filter-layout={usePillSegmentedLayout ? "segmented-pills" : "scroll-pills"}
        className={cn(
          "relative w-full max-w-full min-w-0",
          usePillSegmentedLayout ? "rounded-xl bg-[#e6edf4] p-1" : "overflow-hidden",
        )}
      >
        <RailOrGrid
          scroll={!usePillSegmentedLayout}
          className={cn(
            usePillSegmentedLayout
              ? "grid items-stretch gap-1"
              : "flex gap-1 rounded-xl bg-[#e6edf4] p-1",
            usePillSegmentedLayout && tabs.length === 2 && "grid-cols-2",
            usePillSegmentedLayout && tabs.length === 3 && "grid-cols-3",
            usePillSegmentedLayout && tabs.length === 4 && "grid-cols-4",
          )}
        >
          {tabs.map((tab) => {
            const active = value === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(tab.id)}
                className={cn(
                  "inline-flex min-h-10 max-w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-center text-[13px] font-semibold leading-tight transition-all",
                  usePillSegmentedLayout
                    ? cn("min-w-0", enDosRenglones ? "whitespace-normal [text-wrap:balance]" : "truncate whitespace-nowrap")
                    : "min-w-[8.25rem] flex-none whitespace-nowrap",
                  active ? "bg-white text-[#009FD9] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
                )}
              >
                {label(tab.id)}
                {dotFor?.(tab.id) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#009FD9]" aria-hidden />}
              </button>
            );
          })}
        </RailOrGrid>
      </div>
    );
  }

  // ESTADOS — pastilla segmentada: fondo gris, la activa en blanco. Con dos a
  // cinco etapas se reparte el ancho; con dos se ajusta a su contenido para no
  // ocupar la pantalla entera por dos opciones.
  return (
    <div
      className={cn(
        "group/carril relative w-full max-w-full min-w-0",
        useSegmentedLayout && "rounded-xl bg-[#e6edf4] p-1",
        useScrollableLayout && "overflow-hidden",
        // Cuatro o cinco etapas no caben repartidas en una fila de teléfono:
        // apretarlas partía las palabras ("Enviad…", "Finaliz…"). En el teléfono
        // la fila se desliza con los rótulos enteros —caben tres y la cuarta
        // asoma al marcar la tercera— y de 640 px en adelante se reparten el
        // ancho, que ahí sí alcanza.
        useSegmentedLayout && compacto && "max-sm:overflow-x-auto max-sm:scrollbar-none",
      )}
      data-status-filter-tabs=""
      // "segmented-scroll" = cuatro o cinco etapas: se deslizan en el teléfono y
      // se reparten la fila de 640 px en adelante.
      data-filter-layout={useSegmentedLayout ? (compacto ? "segmented-scroll" : "segmented") : "scroll"}
      ref={useSegmentedLayout && compacto ? carrilSegmentadoContenedor : undefined}
    >
      {useSegmentedLayout && compacto && <FlechasDeCarril carril={carrilRef} />}
      <div
        ref={useSegmentedLayout && compacto ? carrilRef : undefined}
        className={cn(useSegmentedLayout && compacto && "max-sm:overflow-x-auto max-sm:scrollbar-none")}
        style={useSegmentedLayout && compacto ? { maskImage: mascaraCarril, WebkitMaskImage: mascaraCarril } : undefined}
      >
      <RailOrGrid scroll={!useSegmentedLayout} className={cn(
        // Celdas repartidas, pero ninguna por debajo de su propio rótulo: con
        // tres columnas iguales, «Profesionales» y su conteo no cabían en el
        // tercio que les tocaba y salía «Profesional…». Ahora el sobrante se
        // reparte y la palabra manda sobre el reparto.
        useSegmentedLayout
          ? "flex items-stretch gap-1"
          : "flex gap-1 rounded-xl bg-[#e6edf4] p-1",
      )}>
      {tabs.map((tab) => {
        const active = value === tab.id;
        const count = counts?.[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "group relative inline-flex min-h-9 max-w-full items-center justify-center rounded-lg py-1.5 text-center font-semibold leading-tight transition-all",
              useSegmentedLayout
                ? cn(
                    "min-w-0",
                    compacto
                      // Cada etapa toma el ancho de su rótulo y crece con el
                      // sobrante. Debajo de 380px (iPhone SE y parecidos) la
                      // pastilla del conteo se apila bajo el rótulo.
                      ? "gap-1 whitespace-nowrap px-3 text-[13px] max-sm:shrink-0 sm:flex-auto sm:px-1 sm:text-[12px] min-[560px]:text-[13px]"
                      // En 320px («Profesionales» + su conteo en una celda de
                      // 93px) la letra baja medio punto antes que recortar el
                      // rótulo: un filtro se lee entero o no sirve.
                      // El relleno de la celda cede antes que el rótulo: con
                      // tres cifras de conteo («123 favoritos») no quedaban ni
                      // los 79px que mide «Profesionales».
                      : cn(
                          "flex-1 basis-0 gap-0.5 px-0.5 text-[11.5px] min-[360px]:text-[12px] min-[400px]:gap-1 min-[400px]:px-1.5 min-[400px]:text-[13px] sm:gap-1 sm:px-3",
                          // `min-w-fit` es lo que impide que una celda se
                          // encoja por debajo de su rótulo: es justo lo que
                          // evita «Profesional…». Pero cuando el rótulo puede
                          // bajar de renglón, `fit` vale lo que el rótulo
                          // ENTERO en una línea y la fila se sale igual. Con
                          // dos opciones la celda sí puede encoger: el rótulo
                          // no se corta, se parte.
                          enDosRenglones ? "min-w-0" : "min-w-fit",
                        ),
                    enDosRenglones ? "whitespace-normal [text-wrap:balance]" : "whitespace-nowrap",
                  )
                : "gap-1"
                ,
              !useSegmentedLayout && "text-[13px]",
              // Un rótulo corto manda sobre el ancho de la celda: la celda mide
              // lo que mide su palabra y el riel se desliza.
              //
              // Antes la celda valía 6,25rem fijos y el rótulo se apretaba
              // dentro: en un teléfono, «Finalizadas» más su conteo no cabían en
              // ese hueco y salían cortados —«Finaliz…», «Enviad…»—. Repartir el
              // ancho solo tiene sentido cuando sobra, o sea de 640px en
              // adelante; ahí sí vuelven a estirarse para llenar la fila.
              !useSegmentedLayout && (siempreCarril
                // Nunca se encoge: crece si sobra sitio, y si no, se desliza.
                ? "shrink-0 grow whitespace-nowrap"
                : shortLabels
                  ? "shrink-0 whitespace-nowrap px-3 sm:flex-1 sm:shrink sm:px-3"
                  : "shrink-0 whitespace-nowrap px-3 sm:flex-1 sm:shrink"),
              active
                ? "bg-white text-[#009FD9] shadow-sm"
                : "text-[#6b7280] hover:text-[#374151]"
            )}
            aria-pressed={active}
            // El relleno cede hasta 5 px por lado cuando hace falta para que la
            // opción cortada del borde asome lo suficiente (ver ScrollRail).
            style={siempreCarril ? { paddingInline: "calc(14px - var(--ccr-ajuste-carril, 0px))" } : undefined}
          >
            {/* En el riel del teléfono el rótulo va entero: recortarlo ahí era
                justo lo que producía "Enviad…". El recorte se reserva para el
                reparto de ancho, de 640 px en adelante. */}
            <span className={cn("min-w-0 max-w-full", enDosRenglones ? "text-balance" : "truncate")}>
              {label(tab.id)}
            </span>
            {count > 0 && (
              // El conteo es parte del rótulo, no adorno: azul de marca en la
              // activa, pizarra en el resto, siempre legible de un vistazo.
              <span className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-full font-extrabold leading-none tabular-nums transition-colors",
                // En la fila repartida el conteo se achica: con dos cifras
                // ocupaba 25px y el rótulo más largo se quedaba sin 3px, así
                // que «Profesionales» salía recortado en cuanto una cuenta
                // pasaba de nueve favoritos. Es lo que se ve en producción.
                useSegmentedLayout && !compacto
                  ? "h-[18px] min-w-[18px] px-1 text-[10px]"
                  : "h-5 min-w-5 px-1.5 text-[11px]",
                active
                  ? "bg-[#009FD9] text-white"
                  : "bg-[#d5dfe8] text-[#3f4f63] group-hover:bg-[#c8d5e0]"
              )}>
                {count > 99 ? "99+" : count}
              </span>
            )}
            {dotFor?.(tab.id) && <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9] shrink-0" aria-hidden />}
          </button>
        );
      })}
      {/* Tope al final del carril. El relleno derecho del contenedor no se
          respeta cuando se llega al final del desplazamiento: la última pastilla
          quedaba pegada al filo, sin la holgura que sí tiene la primera. Este
          elemento vacío la devuelve, y desaparece de 640 px en adelante, donde
          ya no hay desplazamiento. */}
      {useSegmentedLayout && compacto && <span aria-hidden className="-ml-1 w-1 shrink-0 sm:hidden" />}
      </RailOrGrid>
      </div>
    </div>
  );
}

// Lo que puede tomar, lo que está en juego y lo que ya se cerró. Sin la tercera,
// "Mis propuestas" mezclaba las vivas con trabajos terminados de hace meses.
// Cuatro etapas, con el mismo vocabulario que Citas: lo que terminó bien y lo
// que se cayó son finales opuestos y merecen pestaña propia. Con una sola
// («Terminadas») hacía falta un distintivo dentro de cada tarjeta para saber
// cuál era cuál.
export const PROPUESTA_TABS: readonly FilterTab[] = [
  { id: "nuevas" },
  { id: "respondidas" },
  { id: "finalizadas" },
  { id: "canceladas" },
];
export const SOLICITUD_TABS: readonly FilterTab[] = [
  { id: "en_curso" },
  { id: "finalizadas" },
  { id: "canceladas" },
];
/** Reservas recibidas: una reserva nace confirmada, así que no hay "nuevas"
 *  que esperen respuesta; el profesional ve las mismas dos etapas que el cliente. */
export const SOLICITUD_TABS_PRO: readonly FilterTab[] = [
  { id: "en_curso" },
  { id: "finalizadas" },
  { id: "canceladas" },
];

// A booking's appointment day has fully passed (compared to now, end-of-day).
function isPastAppointment(scheduledDate?: string | null): boolean {
  if (!scheduledDate) return false;
  const [y, m, d] = scheduledDate.split("-").map(Number);
  if (!y || !m || !d) return false;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime() < Date.now();
}

// ── SOLICITUDES (bookings) ──────────────────────────────────────────────────
// Status (+ scheduled date) → the four buckets. A CONFIRMED/in-progress
// appointment whose date already passed is treated as Finalizada.
export function solicitudBucket(status: string, scheduledDate?: string | null): string {
  // Cancelada no es terminada: mezclarlas ensuciaba el historial de trabajos
  // con las citas que nunca ocurrieron.
  if (status === "cancelled" || status === "rescheduled") return "canceladas";
  if (status === "completed" || status === "awaiting_confirmation") return "finalizadas";
  if (isPastAppointment(scheduledDate)) return "finalizadas";
  // Del lado del cliente una cita recién enviada y una ya confirmada son lo
  // mismo: las dos están vivas y él ya sabe cuáles mandó.
  return "en_curso";
}

/** Mismas cubetas para el profesional: "pending" es un residuo de datos viejos y
 *  se lee como una reserva viva. */
export function solicitudBucketPro(status: string, scheduledDate?: string | null): string {
  return solicitudBucket(status, scheduledDate);
}
export function solicitudMatches(filter: string, status: string, scheduledDate?: string | null): boolean {
  return solicitudBucket(status, scheduledDate) === filter;
}

// ── PROYECTOS (a CLIENT's published project) ────────────────────────────────
// Sin etapas propias: un proyecto publicado se mira como un empleo o una
// promoción —está a la vista o no—, ver `proyectoPublicacionBucket`.

/**
 * UN PROYECTO SE MIRA COMO UN EMPLEO O UNA PROMOCIÓN: está a la vista o no.
 *
 * Tenía tres etapas —Activos, Finalizados, Cancelados— de cuando el proyecto
 * recibía propuestas dentro del app y había un desenlace que seguir. Desde que
 * se contesta por WhatsApp, no entra ninguna propuesta: lo que queda es una
 * publicación, igual que las otras dos listas del panel, y la pregunta útil es
 * la misma que allí. Cuál de los dos finales fue lo sigue diciendo la tarjeta.
 */
export function proyectoPublicacionBucket(status: string): string {
  return status === "completed" || status === "cancelled" ? "cerradas" : "activas";
}

// Lo que uno PUBLICA —empleos y promociones— vive en dos estados que importan:
// está a la vista o no lo está. Pausada, vencida, agotada, cerrada y borrador
// son la misma cosa para quien mira su lista: hoy no la ve nadie. Mismas reglas
// que los proyectos, incluida la de no dibujar etapas con pocos elementos.
export const PUBLICACION_ESTADO_TABS: readonly FilterTab[] = [
  { id: "activas" },
  { id: "cerradas" },
];
export function publicacionBucket(status?: string | null): string {
  return status === "published" ? "activas" : "cerradas";
}

// ── PROYECTOS (a PRO's own proposal) ────────────────────────────────────────
// Bucketed by the PROPOSAL first (so a declined proposal lands in Canceladas even
// if the project moved on with someone else), then the project's lifecycle once
// the proposal was accepted.
export function proposalBucket(proposalStatus?: string | null, projectStatus?: string | null): string {
  // El trabajo se hizo → finalizada. El proyecto se cayó, o la propuesta quedó
  // fuera (el cliente la descartó o el profesional la retiró) → cancelada.
  if (projectStatus === "completed") return "finalizadas";
  if (projectStatus === "cancelled") return "canceladas";
  if (proposalStatus === "declined" || proposalStatus === "withdrawn") return "canceladas";
  return "respondidas";
}
// Build a {bucket: count} map for the count badges. Pass the items' resolved buckets.
export function bucketCounts(buckets: string[]): Record<string, number> {
  const counts: Record<string, number> = { activas: 0, en_curso: 0, finalizadas: 0 };
  for (const b of buckets) counts[b] = (counts[b] ?? 0) + 1;
  return counts;
}

// ── In-card status badge: REDUNDANT-status detection ────────────────────────
// Because the view is ALWAYS inside a status tab (no all/mixed view), a card whose
// granular status is the bucket's PRIMARY status just repeats the tab → don't show
// the badge again. Genuine SUB-states (in_progress, awaiting_confirmation,
// rescheduled, declined-vs-cancelled, …) return false → the badge IS still shown.
const SOLICITUD_PRIMARY: Record<string, string[]> = {
  nuevas: ["pending"],
  en_curso: ["confirmed", "in_progress", "pending"],
  // En Finalizadas conviven completadas y canceladas: la insignia debe distinguirlas.
  finalizadas: [],
};
export function solicitudStatusRedundant(status: string, scheduledDate?: string | null): boolean {
  return SOLICITUD_PRIMARY[solicitudBucket(status, scheduledDate)]?.includes(status) ?? false;
}
export function proposalStatusRedundant(proposalStatus: string, projectStatus?: string | null): boolean {
  // La única insignia útil es la de la solicitud (resuelta / cancelada / te eligió).
  return proposalStatus === "pending" && (!projectStatus || projectStatus === "open");
}
