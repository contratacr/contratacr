"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { normalizeText } from "@/lib/data/categories";
import { PROVINCES } from "@/lib/data/cr-geography";
import { useTranslations } from "next-intl";
import { MapPin, Video } from "lucide-react";
import { SelfActionModal, SELF_MSG } from "./self-action-modal";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { AccionesAlPie } from "@/components/ui/acciones-al-pie";
import { ContactButton } from "@/components/professionals/contact-button";

/**
 * Dónde atiende y cómo contactarlo: la parte de abajo de cada tarjeta de
 * /profesionales y la tarjeta de contacto de la ficha.
 *
 * Aquí vivió el calendario de citas (horarios por día, «Ver disponibilidad»).
 * En toda la historia de producción hubo CERO citas y el 8-oct-2026 se borró
 * entero; si vuelve en una versión pro, está en el historial de git.
 */

interface ProfessionalScheduleProps {
  professional: ProfessionalCardData;
  categoryName: string;
  /** When the client searched a specific profession (contact context). */
  activeCategory?: string;
  /** False when the searched service does not support video consultations: the
   *  card then hides the Videoconsulta place even if the profile has it on. */
  videoConsultApplies?: boolean;
  /** True when the viewer owns this profile — no self-service actions. */
  isOwn?: boolean;
  /** The LEFT-column professional info (photo, name, price, tags, rating),
   *  rendered by the card and slotted in so this component owns the desktop
   *  two-column layout. */
  info?: ReactNode;
  /** Fallback location label (province/cantón) shown only when the pro has no
   *  named workplaces, so the card always says WHERE they work. */
  placeFallback?: string;
  /** Fallback address line ("cantón, provincia") for the no-workplace case. */
  placeAddress?: string;
  /** Business/brand name — bolded as the venue prefix on a real workplace address. */
  businessName?: string;
  /** Abre la lista completa de zonas (la pestaña Información de la ficha). */
  onVerZonas?: () => void;
  /** Lo que va a la derecha de la zona, en la misma fila (el precio en la
   *  tarjeta de resultados): «dónde y cuánto» en un solo renglón. */
  alLadoDeLaZona?: ReactNode;
  /**
   * Debajo de esta tarjeta viene algo más —las redes del profesional, que las
   * pinta la ficha—. Sin eso, la raya que cierra la ubicación no separa nada:
   * queda una línea suelta contra el borde de la tarjeta.
   */
  hayContenidoDespues?: boolean;
  /** STACKED single-column layout for the professional-profile contact card:
   *  location → buttons. Default false = the /profesionales card layout. */
  stacked?: boolean;
  /** Explicit video-consultation search result: show that place only. */
  forceContactOnly?: boolean;
  /** Preferred place when search context should show a specific location/modality. */
  preferredLocationId?: string;
  /** Lo que la persona buscó (cantón o provincia): un lugar de trabajo de toda la
   *  provincia o de todo el país se muestra como «Atiende en Atenas», no como
   *  «Provincia de Alajuela», y va primero. */
  searchedPlace?: SearchedPlace;
  /** Restrict to the preferred location when the search matched only that modality. */
  restrictToPreferredLocation?: boolean;
}

export type SearchedPlace = { cantonId?: string; cantonName?: string; provinceId?: string; provinceName?: string };

// Un lugar de trabajo que cubre una provincia entera o el país entero. Los viejos
// no traen `level`: se reconocen por el nombre con el que se guardaron.
function cubreProvinciaEntera(w: { level?: string; cantonId?: string; provinciaId?: string; name?: string }, nombre: string) {
  return w.level === "provincia" || (!w.cantonId && !!w.provinciaId) || /^Toda la provincia de\s/i.test(nombre) || /^All of .+ province$/i.test(nombre);
}
function cubrePaisEntero(w: { level?: string; id?: string }, nombre: string) {
  return w.level === "country" || w.id === "wp_todo_costa_rica" || /^Todo Costa Rica$/i.test(nombre) || /^All of Costa Rica$/i.test(nombre);
}

export function ProfessionalSchedule({ professional, categoryName, searchedPlace, videoConsultApplies = true, activeCategory, isOwn = false, info, placeFallback = "", placeAddress = "", businessName = "", onVerZonas, alLadoDeLaZona, stacked = false, forceContactOnly = false, preferredLocationId, restrictToPreferredLocation = false, hayContenidoDespues = false }: ProfessionalScheduleProps) {
  // ¿Se buscó una zona? Con una zona en la búsqueda, todo lo que sale la cubre.
  const zonaBuscada = Boolean(searchedPlace?.cantonName?.trim() || searchedPlace?.provinceName?.trim());
  const t = useTranslations("schedule");
  // Qué ubicación se está buscando, para poner delante los lugares que sirven.
  const searchParams = useSearchParams();
  // When the pro acts on their OWN card we block the action with a friendly modal
  // instead of hiding the buttons (the card looks identical to a client's view).
  const [selfMsg, setSelfMsg] = useState<string | null>(null);

  function locTabLabel(label: string): string {
    return label
      .replace(/^Toda la provincia de\s+/i, "Provincia de ")
      .replace(/^All of (.+) province$/i, "$1 province");
  }
  // Street address for the detail line shown UNDER the location tabs. Only physical
  // workplaces have one — coverage zones (cov_*) / videoconsulta / general don't.
  function locAddress(id: string | null): string {
    if (!id || id === "general" || id === "videoconsulta" || id.startsWith("cov_")) return "";
    return professional.workplaces?.find((w) => w.id === id)?.address?.trim() ?? "";
  }
  // ── SERVICE LOCATIONS ── the pro's named WORKPLACES (plus videoconsulta), keyed
  // by id. `cov_*` is travel coverage, not a place, so it never becomes a row.
  const locationOptions = useMemo(() => {
    const map = new Map<string, string>(); // id -> label, insertion-ordered
    const videoLabel = t("videoconsulta");
    const normalizedVideoLabel = videoLabel.trim().toLocaleLowerCase();
    // Quien buscó «Atenas» y encuentra a alguien que cubre toda Alajuela debe
    // leer el lugar EXACTAMENTE como lo lee en quien tiene Atenas fijo —«Atenas,
    // Alajuela»—, no «Provincia de Alajuela» ni un rótulo aparte: la cobertura
    // es real y el lugar buscado es el que confirma que sí le sirve. Va primero
    // en la fila. Sin cantón buscado no se re-rotula nada: quien cubre el país
    // sigue diciendo «Todo Costa Rica».
    // Buscar UNA PROVINCIA entera es igual de concreto que buscar un cantón: quien
    // cubre Alajuela debe leerse «Alajuela», no «Toda la provincia de Alajuela».
    // El rótulo largo suena a promesa vaga al lado de quien dice «Atenas», y la
    // cobertura es exactamente la que se pidió: decirla con el nombre del lugar
    // buscado la pone en igualdad, sin exagerar nada.
    const lugarBuscado = searchedPlace?.cantonName
      ? [searchedPlace.cantonName, searchedPlace.provinceName].filter(Boolean).join(", ")
      : searchedPlace?.provinceName?.trim() || "";
    // Si el profesional YA tiene ese cantón entre sus lugares, la cobertura
    // amplia se queda con su propio nombre: si no, la fila mostraba dos veces
    // «Atenas, Alajuela» —el lugar de verdad y la provincia re-rotulada— y
    // parecía un error.
    const yaAtiendeElCanton = !!lugarBuscado && (professional.workplaces ?? []).some((w) => {
      const lugar = w as { cantonId?: string; name?: string };
      return (!!searchedPlace?.cantonId && lugar.cantonId === searchedPlace.cantonId)
        || (lugar.name?.trim() ?? "") === lugarBuscado;
    });
    const primero = new Map<string, string>();
    for (const w of professional.workplaces ?? []) {
      const rawLabel = (w as { label?: unknown }).label;
      const label = w.name?.trim() || (typeof rawLabel === "string" ? rawLabel.trim() : "");
      const isVideoWorkplace = label.trim().toLocaleLowerCase() === normalizedVideoLabel || (w as { type?: unknown }).type === "video";
      if (isVideoWorkplace && !videoConsultApplies) continue;
      const id = isVideoWorkplace ? "videoconsulta" : (w.id || (professional.workplaces?.length === 1 ? "general" : ""));
      if (!id || !label) continue;
      const lugar = w as { level?: string; cantonId?: string; provinciaId?: string; name?: string; id?: string };
      const cubreLaProvinciaBuscada = !!lugarBuscado && cubreProvinciaEntera(lugar, label)
        && ((!!searchedPlace?.provinceId && lugar.provinciaId === searchedPlace.provinceId) || (!!searchedPlace?.provinceName && label.includes(searchedPlace.provinceName)));
      const cubreElPaisYBuscaronLugar = !!lugarBuscado && cubrePaisEntero(lugar, label);
      if (!isVideoWorkplace && !yaAtiendeElCanton && (cubreLaProvinciaBuscada || cubreElPaisYBuscaronLugar)) {
        // Decir LAS DOS COSAS: que llega al lugar buscado, y desde qué
        // cobertura. «Atenas, Alajuela» a secas presentaba como vecino a
        // quien cubre cuatro provincias desde San Ramón; «Toda la provincia
        // de Alajuela» a secas obligaba al cliente a deducir si Atenas entra.
        // En Atenas, 23 de 27 tarjetas eran de cobertura, no del cantón.
        // Buscando solo una provincia, la cobertura de esa provincia se queda
        // con el nombre de la provincia, que ya dice todo.
        const rotulo = cubreElPaisYBuscaronLugar
          ? t("atiendeEnPais", { lugar: searchedPlace?.cantonName || searchedPlace?.provinceName || "" })
          : searchedPlace?.cantonName
            ? t("atiendeEnProvincia", { lugar: searchedPlace.cantonName })
            : lugarBuscado;
        const repetido = Array.from(primero.values()).includes(rotulo)
          || Array.from(map.values()).includes(rotulo);
        if (!primero.size && !repetido) primero.set(id, rotulo);
        continue;
      }
      map.set(id, label);
    }
    if (lugarBuscado && !yaAtiendeElCanton && !primero.size && professional.coverage?.country) {
      primero.set("pais", t("atiendeEnPais", { lugar: searchedPlace?.cantonName || searchedPlace?.provinceName || "" }));
    }
    for (const [id, label] of Array.from(map)) { if (!primero.has(id)) primero.set(id, label); }
    map.clear();
    for (const [id, label] of primero) map.set(id, label);
    const hasVideoOption = map.has("videoconsulta") || Array.from(map.values()).some((label) => label.trim().toLocaleLowerCase() === normalizedVideoLabel);
    if (videoConsultApplies && (professional.videoconsulta || professional.coverage?.country) && !hasVideoOption) {
      map.set("videoconsulta", videoLabel);
    }
    return Array.from(map, ([id, label]) => ({ id, label }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professional.coverage?.country, professional.workplaces, professional.videoconsulta, searchedPlace, t, videoConsultApplies]);

  const visibleLocationOptions = useMemo(() => {
    if ((forceContactOnly || restrictToPreferredLocation) && preferredLocationId) {
      const preferred = locationOptions.find((o) => o.id === preferredLocationId);
      if (preferred) return [preferred];
    }
    if (locationOptions.length <= 1) return locationOptions;
    // El lugar buscado va primero: es la razón por la que este perfil apareció.
    const rotuloBuscado = searchedPlace?.cantonName
      ? [searchedPlace.cantonName, searchedPlace.provinceName].filter(Boolean).join(", ")
      : null;
    return locationOptions
      .map((option, index) => ({ option, index, buscado: !!rotuloBuscado && option.label === rotuloBuscado }))
      .sort((a, b) => Number(b.buscado) - Number(a.buscado) || a.index - b.index)
      .map(({ option }) => option);
  }, [forceContactOnly, locationOptions, preferredLocationId, restrictToPreferredLocation, searchedPlace]);

  const effectiveId = visibleLocationOptions.length > 0
    ? (visibleLocationOptions.find((o) => preferredLocationId && o.id === preferredLocationId)?.id
      ?? visibleLocationOptions[0].id)
    : null;

  // ── LOCATION line (LEFT column, under the rating) — the main place, how many
  // more, and the selected place's street address. Always shown, so a card
  // always says WHERE they work; without named workplaces it falls back to the
  // province/cantón.
  const hasRealLoc = visibleLocationOptions.length > 0;
  const locTabs = hasRealLoc
    ? visibleLocationOptions
    : (placeFallback ? [{ id: "__fallback", label: placeFallback }] : []);
  // Los lugares que se muestran no pueden ser "los dos primeros de la lista":
  // si alguien busca en Cartago y el profesional atiende en San José, Heredia y
  // Cartago, la tarjeta enseñaba los dos que NO le sirven y escondía el bueno
  // detrás del "+2". Se ordenan poniendo delante los que coinciden con la
  // ubicación que se está buscando.
  const zonasBuscadas = useMemo(() => {
    const terminos: string[] = [];
    const ubicacion = searchParams?.get("ubicacion");
    if (ubicacion) terminos.push(ubicacion);
    const cantonId = searchParams?.get("canton");
    const provinciaId = searchParams?.get("provincia");
    for (const provincia of PROVINCES) {
      if (provinciaId && provincia.id === provinciaId) terminos.push(provincia.name);
      for (const canton of provincia.cantons) {
        if (cantonId && canton.id === cantonId) terminos.push(canton.name, provincia.name);
      }
    }
    return terminos.flatMap((termino) => normalizeText(termino).split(/[\s,]+/)).filter((parte) => parte.length >= 4);
  }, [searchParams]);

  const coincideConLaBusqueda = useMemo(() => {
    if (zonasBuscadas.length === 0) return () => false;
    return (option: { id: string; label: string }) => {
      const texto = normalizeText(`${option.label} ${locAddress(option.id)}`);
      return zonasBuscadas.some((parte) => texto.includes(parte));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonasBuscadas, professional.workplaces]);

  const locTabsOrdenados = useMemo(() => {
    if (locTabs.length <= 2 || zonasBuscadas.length === 0) return locTabs;
    const cerca = locTabs.filter(coincideConLaBusqueda);
    if (cerca.length === 0) return locTabs;
    return [...cerca, ...locTabs.filter((option) => !cerca.some((c) => c.id === option.id))];
  }, [locTabs, zonasBuscadas, coincideConLaBusqueda]);

  const primaryLocationTabs = locTabsOrdenados;
  // La fila es una sola línea informativa —la zona principal y cuántas más
  // hay—; la lista completa vive en Información.
  const zonasRestantes = Math.max(0, primaryLocationTabs.length - 1);
  const zonaPrincipalEsVideo = primaryLocationTabs[0]?.id === "videoconsulta"
    || (!hasRealLoc && videoConsultApplies && !!(professional.videoconsulta || professional.coverage?.country));
  // Address under the tabs: follow the selected tab. If a workplace has no exact
  // address, show that tab label instead of falling back to another location from
  // the search result.
  const isVideoLocation = effectiveId === "videoconsulta";
  const workplaceAddr = hasRealLoc && effectiveId && !isVideoLocation ? locAddress(effectiveId) : "";
  const selectedLocationLabel = hasRealLoc && effectiveId && !isVideoLocation
    ? visibleLocationOptions.find((o) => o.id === effectiveId)?.label?.trim() ?? ""
    : "";
  const addressLineRaw = isVideoLocation
    ? ""
    : hasRealLoc
      ? (workplaceAddr || selectedLocationLabel)
      : (placeAddress || "");
  // The tabs row already names the place: a "whole province" note or a repeat of
  // the selected tab adds nothing, so only REAL street addresses render below.
  const addressLine = /^(toda la provincia|all of )/i.test(addressLineRaw.trim()) || (selectedLocationLabel.trim() !== "" && addressLineRaw.trim() === selectedLocationLabel.trim())
    ? ""
    : addressLineRaw;
  const venueName = workplaceAddr ? businessName.trim() : "";
  const locationControl = locTabs.length > 0 ? (
    <div
      className="relative z-30 w-full min-w-0"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative">
        {/* UNA zona, no la lista entera. La lista completa —con sus direcciones
            y la videoconsulta— ya vive en Información, así que aquí estaba
            repetida: seis zonas gastaban tres renglones del sitio más caro de
            la ficha y empujaban los botones de contactar hacia abajo. Arriba
            queda lo justo para saber si sirve, y «+N zonas» lleva a la lista.
            En la tarjeta, con el precio a la derecha, la fila no salta de
            línea: la zona se recorta con «…» antes que el precio, que pesa
            más en la decisión (8-oct-2026). */}
          <div data-testid="professional-card-location-row" className="flex min-w-0 items-center gap-3">
          <p className={`flex min-w-0 items-center gap-x-1.5 gap-y-1 text-[12px] font-semibold leading-5 text-[#6b7280] ${alLadoDeLaZona ? "flex-1 flex-nowrap" : "flex-wrap"}`} aria-label={t("location")}>
            <span className="inline-flex min-w-0 items-center gap-1">
              {zonaPrincipalEsVideo ? <Video className="h-3 w-3 shrink-0" /> : <MapPin className="h-3 w-3 shrink-0" />}
              <span className={alLadoDeLaZona ? "min-w-0 truncate" : "min-w-0"}>{locTabLabel(primaryLocationTabs[0].label)}</span>
            </span>
            {/* «+N zonas más» cuando dice algo.
                En la FICHA es un botón que abre Información con la lista entera.
                En una TARJETA de resultados depende de si se buscó una zona:
                  · con zona buscada, sobra — que la tarjeta aparezca ya
                    significa que la cubre, y el contador contesta algo que
                    nadie preguntó;
                  · sin zona buscada, hace falta — es lo único que avisa de que
                    este profesional trabaja en más sitios que el que se lee, y
                    tocar la tarjeta lleva a la lista completa. */}
            {zonasRestantes > 0 && (onVerZonas || !zonaBuscada) && (
              onVerZonas ? (
                <button
                  type="button"
                  onClick={onVerZonas}
                  aria-label={t("moreZones", { count: zonasRestantes })}
                  // La etiqueta lo saca de la regla de 44 px de alto mínimo de la
                  // app (globals.css): estiraba la fila entera y metía ~12 px de
                  // aire invisible arriba de la zona. El área de toque sigue
                  // grande con el ::after.
                  className="relative min-h-0 shrink-0 rounded-sm font-bold text-[#007fae] underline-offset-2 after:absolute after:-inset-3 after:content-[''] hover:underline"
                >
                  {t("moreZones", { count: zonasRestantes })}
                </button>
              ) : (
                // En la tarjeta basta «+5»: el ícono de ubicación ya dice de qué.
                <span className="shrink-0 font-bold text-[#52627a]" aria-label={t("moreZones", { count: zonasRestantes })}>+{zonasRestantes}</span>
              )
            )}
          </p>
          {alLadoDeLaZona}
          </div>
      </div>
      {/* mt-4: el mismo aire arriba de esta línea que el que hay entre la línea
          de arriba y el precio (con mt-1 quedaba pegada a la zona). */}
      {(addressLine || hayContenidoDespues) && <div className="mt-4 h-px w-full bg-[#e5e7eb]" aria-hidden />}
      {addressLine && (
        <p className="mt-1.5 text-[11px] leading-snug text-[#6b7280]">
          {venueName && <span className="font-semibold text-[#374151]">{venueName} · </span>}
          {addressLine}
        </p>
      )}
    </div>
  ) : null;

  // Self-action notice — rendered in every branch so the pro's own card shows the
  // same buttons as a client's but blocks the action with a friendly explanation.
  const selfModal = (
    <SelfActionModal open={!!selfMsg} onClose={() => setSelfMsg(null)} message={selfMsg ?? ""} />
  );

  // Direct-contact actions. WhatsApp shows whenever a number exists; "Llamar" only
  // when the pro enabled phone contact. Both are blocked on the pro's OWN card.
  // `stacked` = vertical (one above the other) — used for the PRIVATE case where
  // these are the only actions; otherwise they share ONE compact row so adding
  // "Llamar" above "Solicitar servicio" never adds a line.
  // Numbers are redacted for guests; the flags say whether the action exists.
  const showCall = professional.hasCallPhone ?? (!!professional.allowPhoneCall && !!(professional.callPhone || professional.whatsapp));

  const contactSource = stacked ? "profile" : "search";
  // Secundario del app: píldora blanca con borde. Con icono, como el resto de
  // los botones de contacto: «Llamar» sin él se leía como una etiqueta.
  // Dos altos, uno por sitio: en la tarjeta de /buscar el botón mide 44 px,
  // como el resto de la tarjeta; en la franja pegada al fondo del perfil mide
  // 48, exactamente lo que mide «Publicar» en Crear proyecto. La franja es la
  // misma pantalla en todas las secciones y tiene que medir lo mismo en todas.
  const secondaryContactBase = "w-full inline-flex items-center justify-center gap-1.5 rounded-full border border-[#d7e1ea] bg-white py-0 text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb] disabled:opacity-60";
  const secondaryContactClass = `h-11 text-[13px] font-bold ${secondaryContactBase}`;
  // En la franja el botón es el mismo que «Publicar» en Crear proyecto: 48 px
  // de alto y el rótulo a 16 px semibold. A 13 px la acción que trajo a la
  // persona se leía como una nota al pie.
  const secondaryContactBarClass = `h-12 text-base font-semibold ${secondaryContactBase}`;
  // Profile page uses the short label "Llamar"; /buscar keeps "Contáctanos por llamada".
  const renderCall = (className = secondaryContactClass, label = t("callShort")) => (
    <ContactButton
      method="phone"
      professionalId={professional.id}
      professionalName={professional.fullName}
      contextTitle={categoryName}
      categoryId={activeCategory ?? null}
      source={contactSource}
      isOwn={isOwn}
      onSelfAction={() => setSelfMsg(SELF_MSG.call)}
      className={className}
      label={label}
    />
  );
  const messageButtonBase = "w-full rounded-full py-0";
  const messageButtonClass = `h-11 text-[13px] font-bold ${messageButtonBase}`;
  const messageButtonBarClass = `h-12 text-base font-semibold ${messageButtonBase}`;
  // El verde lo pone la variante «whatsapp» del botón, igual que en el resto
  // del app: aquí solo va la medida de la tarjeta.
  const searchMessageButtonClass = messageButtonClass;
  // El rótulo «WhatsApp» lo pone el propio lanzador y es el mismo en todo el
  // app; aquí solo se le da la medida de la tarjeta.
  const whatsappDeLaTarjeta = (
    <DirectChatLauncher professionalId={professional.id} professionalName={professional.fullName} contextTitle={categoryName} isOwn={isOwn} onSelfAction={() => setSelfMsg(SELF_MSG.whatsapp)} analyticsSource={stacked ? "profile" : "search"} className={searchMessageButtonClass} buttonLabel={t("whatsappLong")} />
  );
  const contactButtons = showCall ? (
    // Uno arriba del otro, en todos los tamaños, con el rótulo que dice qué
    // pasa: «Contactar por WhatsApp» / «Contactar por llamada». Lado a lado
    // cabían solo «WhatsApp» y «Llamar», y en /buscar es la primera vez que la
    // persona ve al profesional: conviene que el botón lo diga entero.
    <div className="grid grid-cols-1 gap-2">
      {whatsappDeLaTarjeta}
      {renderCall(undefined, t("call"))}
    </div>
  ) : (
    whatsappDeLaTarjeta
  );

  // Perfil: agendar manda y ocupa su propia línea; debajo, escribir y llamar
  // comparten fila. El correo salió de aquí: repetía el mensaje y mandaba la
  // conversación fuera del app.
  const chatLauncher = (
    <DirectChatLauncher
      professionalId={professional.id}
      professionalName={professional.fullName}
      contextTitle={categoryName}
      isOwn={isOwn}
      onSelfAction={() => setSelfMsg(SELF_MSG.whatsapp)}
      analyticsSource="profile"
      tone="primary"
      className={messageButtonBarClass}
    />
  );
  const profileContactButtons = (
    <>
      {/* «Ver disponibilidad» dejó de ser la acción principal: en toda la
          historia hubo CERO reservas y solo 2 profesionales de 289 publicaron
          horarios, mientras que por WhatsApp salieron 95 contactos en dos meses.
          Lo que la ficha ofrece ahora es contactar, por donde el profesional
          dijo que lo contacten. */}
      {/* Con agenda son tres acciones y las dos de contacto comparten fila; sin
          agenda solo hay dos y cada una ocupa su propio renglón, a lo ancho:
          media píldora para la única forma de contactar se leía como algo menor. */}
      {/* Las dos formas de contactar comparten renglón: escribir a la izquierda,
          llamar a la derecha. El botón mide lo mismo que «Publicar» en Crear
          proyecto —48 px de alto y el rótulo a 16— y lo único que cambia es que
          aquí hay dos acciones y cada una se lleva media franja. */}
      {showCall ? (
        <div className="grid grid-cols-2 gap-2">
          {chatLauncher}
          {renderCall(secondaryContactBarClass)}
        </div>
      ) : (
        chatLauncher
      )}
    </>
  );


  if (stacked) {
    return (
      <>
        <div className="flex flex-col gap-3">
          {locationControl}
          {/* En el teléfono, contactar vive en su propia franja pegada al
              fondo, igual que en Crear proyecto: la ficha es larga —servicios,
              reseñas, casos— y el botón que trajo a la persona quedaba a mitad
              de camino, arriba, y desaparecía apenas bajaba a leer. En
              computadora se queda donde estaba: ahí la columna de contacto ya
              está siempre a la vista. */}
          <AccionesAlPie className="flex flex-col gap-2">
            {profileContactButtons}
          </AccionesAlPie>
        </div>
        {selfModal}
      </>
    );
  }

  return (
    <>
      {/* MOBILE (<lg) = SINGLE column: [info + location] then the contact
          buttons. DESKTOP (lg+) = a COMPACT HORIZONTAL card: the LEFT column (info +
          location) and the RIGHT rail (buttons, 292px) separated by a VERTICAL divider. */}
      {/* El riel de botones mide 292 px desde 1280; entre 1024 y 1279 (iPad)
          baja a 216: con 292 fijos la tarjeta de ~550 px dejaba ~110 px para
          el nombre y salía «Electr…» (9-oct-2026). */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_216px] lg:gap-4 xl:grid-cols-[minmax(0,1fr)_292px] xl:gap-5">
        <div className="flex min-w-0 flex-col gap-2.5">
          {info}
          {locationControl}
        </div>
        {/* `lg:pt-6` reserves a small TOP band so the favorites bookmark (top-right of
            the card) sits cleanly in the corner ABOVE the buttons. */}
        <div className="relative z-10 flex min-w-0 flex-col gap-3 lg:justify-center lg:border-l lg:border-[#e5e7eb] lg:pt-6 lg:pl-4">
          {contactButtons}
        </div>
      </div>
      {selfModal}
    </>
  );
}
