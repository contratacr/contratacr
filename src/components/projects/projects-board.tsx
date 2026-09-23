"use client";

import { conFiltroDeFecha } from "@/lib/marketplace/filtros-por-volumen";
import { formatPersonDisplayName } from "@/lib/display-name";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { ArrowLeft, ClipboardList, Loader2, Menu } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { ContrataCRMark, HeaderAccountLink } from "@/components/landing/landing-navbar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { MarketplaceFilterChip, MarketplaceNavbarPortal, MarketplaceSearch } from "@/components/marketplace/marketplace-controls";
import { ScrollRail } from "@/components/ui/scroll-rail";
import { useHairlineOnScroll } from "@/components/util/use-hairline-on-scroll";
import { cn } from "@/lib/utils";
import { safeMarketplaceReturnHref } from "@/lib/navigation/marketplace-return";
import { PanelEmptyState } from "@/components/ui/content-loading";
import { WhatsAppLogo } from "@/components/ui/whatsapp-logo";
import { marketplaceLocale } from "@/lib/marketplace-copy";
import { type ProyectoPublico } from "@/lib/proyectos";
import { MenuProyecto } from "@/components/projects/menu-proyecto";
import { PublishProjectModal } from "@/components/projects/publish-project-modal";
import { ProgressiveImage } from "@/components/ui/progressive-image";
import { cldThumb } from "@/lib/cloudinary";
import { AccionesAlPie } from "@/components/ui/acciones-al-pie";
import { SaveItemButton } from "@/components/saved/save-item-button";
import { CABECERA_BOTON, CABECERA_FILA, CABECERA_FILA_CENTRADA, CABECERA_GLIFO, CABECERA_TITULO } from "@/components/layout/cabecera";
import { getCategoryGroupIcon } from "@/lib/data/category-group-visuals";
import { getCategoryGroupId } from "@/lib/data/categories";

const COPY = {
  es: {
    titulo: "Proyectos",
    // Cada tablero pregunta por lo suyo: aquí se buscan PROYECTOS, no
    // profesionales. «¿Qué servicio estás buscando?» es la frase de /buscar, y
    // repetida aquí parecía que la pantalla buscaba a quién contratar.
    buscar: "¿Qué proyecto buscas?",
    abrirMenu: "Abrir menú",
    notificaciones: "Notificaciones",
    publicar: "Publicar proyecto",
    // «Fecha», igual en los tres tableros. «Publicado» a secas se leía como
    // un estado —¿publicado o no?— y no como «cuándo se publicó».
    loQueNecesita: "Lo que necesita",
    filaServicio: "Servicio", filaUbicacion: "Ubicación", filaPublicado: "Publicado",
    fecha: "Fecha",
    cualquierFecha: "Cualquier fecha",
    hoy: "Últimas 24 horas",
    semana: "Última semana",
    mes: "Último mes",
    misProyectos: "Mis proyectos",
    administrar: "Administrar proyecto",
    editar: "Editar",
    administrarCorto: "Administrar",
    ubicacion: "Ubicación",
    volver: "Volver a proyectos",
    ficha: "Proyecto",
    escribir: "WhatsApp",
    publicado: "Publicado por",
    vacio: "Todavía no hay proyectos",
    vacioSub: "Cuando alguien publique lo que necesita, aparecerá aquí.",
    sinResultados: "No encontramos proyectos",
    sinResultadosSub: "Prueba otra búsqueda o cambia los filtros.",
    verTodos: "Ver todos los proyectos",
    sinContacto: "Este cliente no dejó un WhatsApp.",
    necesitaCuenta: "Entra con tu cuenta profesional para escribirle.",
    esTuyo: "Este proyecto es tuyo.",
    todoElPais: "Todo Costa Rica",
    cuenta: (n: number) => `${n} ${n === 1 ? "proyecto" : "proyectos"}`,
  },
  en: {
    titulo: "Projects",
    buscar: "Search projects",
    abrirMenu: "Open menu",
    notificaciones: "Notifications",
    publicar: "Post a project",
    loQueNecesita: "What they need",
    filaServicio: "Service", filaUbicacion: "Location", filaPublicado: "Posted",
    fecha: "Date posted",
    cualquierFecha: "Any date",
    hoy: "Past 24 hours",
    semana: "Past week",
    mes: "Past month",
    misProyectos: "My projects",
    administrar: "Manage project",
    editar: "Edit",
    administrarCorto: "Manage",
    ubicacion: "Location",
    volver: "Back to projects",
    ficha: "Project",
    escribir: "WhatsApp",
    publicado: "Posted by",
    vacio: "There are no projects yet",
    vacioSub: "When someone posts what they need, it will show up here.",
    sinResultados: "No projects found",
    sinResultadosSub: "Try another search or change the filters.",
    verTodos: "View all projects",
    sinContacto: "This client did not leave a WhatsApp number.",
    necesitaCuenta: "Sign in with your professional account to write to them.",
    esTuyo: "This project is yours.",
    todoElPais: "All Costa Rica",
    cuenta: (n: number) => `${n} ${n === 1 ? "project" : "projects"}`,
  },
} as const;

function cuandoSePublico(iso: string, en: boolean) {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 60) return en ? `${minutos} min ago` : `Hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return en ? `${horas} h ago` : `Hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return en ? "Yesterday" : "Ayer";
  return en ? `${dias} days ago` : `Hace ${dias} días`;
}

/** Escribirle al cliente. El número no está en la página: se pide al tocar, y
 *  la ruta exige cuenta profesional (ver /api/contact/project-lead). */
function BotonEscribir({ proyecto, className = "" }: { proyecto: ProyectoPublico; className?: string }) {
  const locale = marketplaceLocale(useLocale());
  const copy = COPY[locale];
  const [cargando, setCargando] = useState(false);
  // El aviso del app, no el del navegador: `window.alert` sale con la letra y
  // los botones del sistema, en el idioma del sistema, y encima bloquea la
  // página. Aquí se está contactando a alguien: es el peor momento para eso.
  const { dialogNode, showMessage } = useAppDialog();

  async function abrir() {
    setCargando(true);
    try {
      const res = await fetch("/api/contact/project-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: proyecto.id }),
      });
      const payload = (await res.json().catch(() => ({}))) as { href?: string };
      const aviso = res.status === 401 || res.status === 403 ? copy.necesitaCuenta
        : res.status === 409 ? copy.esTuyo
        : !res.ok || !payload.href ? copy.sinContacto
        : null;
      if (aviso) { await showMessage({ title: copy.escribir, description: aviso }); return; }
      window.open(payload.href, "_blank", "noopener,noreferrer");
    } finally {
      setCargando(false);
    }
  }

  if (!proyecto.allow_direct_contact) return null;
  return (
    <>
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void abrir(); }}
      disabled={cargando}
      // 48 px de alto: el botón vive en la franja del fondo y ahí mide lo
      // mismo que «Publicar» en Crear proyecto.
      className={cn("inline-flex h-12 w-full items-center justify-center gap-1.5 ccr-boton-whatsapp rounded-full px-4 text-base font-semibold text-white transition disabled:opacity-60", className)}
    >
      {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <WhatsAppLogo />}
      {copy.escribir}
    </button>
    {dialogNode}
    </>
  );
}

/**
 * La foto de quien publica, en la misma caja redonda que el logo del empleador
 * en Empleos. Muchas veces es la foto de su perfil profesional, porque la
 * cuenta es la misma. Sin foto van sus iniciales —no el ícono del rubro: es una
 * persona, no una categoría—, y sin nombre queda el ícono del rubro como antes.
 */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

function FotoDeQuienPublica({ proyecto, grande = false }: { proyecto: ProyectoPublico; grande?: boolean }) {
  const medida = grande ? "h-14 w-14" : "h-11 w-11 sm:h-12 sm:w-12";
  if (proyecto.client_avatar_url) {
    return (
      <ProgressiveImage
        src={cldThumb(proyecto.client_avatar_url, 96)}
        alt={proyecto.client_name}
        fit="cover"
        wrapperClassName={cn(medida, "shrink-0 rounded-full")}
        className="rounded-full"
      />
    );
  }
  const letras = iniciales(proyecto.client_name);
  if (letras) {
    return (
      <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full bg-[#eaf7fc] font-extrabold text-[#0089bb]", medida, grande ? "text-lg" : "text-base")}>
        {letras}
      </span>
    );
  }
  const Icono = getCategoryGroupIcon(proyecto.category_id ? getCategoryGroupId(proyecto.category_id) : null);
  return (
    <span aria-hidden className={cn("ccr-caja-icono-plana grid shrink-0 place-items-center rounded-full", medida)}>
      <Icono className={grande ? "h-6 w-6" : "h-5 w-5"} strokeWidth={1.8} />
    </span>
  );
}

/** Lo que se guarda de un proyecto, para pintarlo en Favoritos sin ir a buscarlo. */
function retrato(proyecto: ProyectoPublico) {
  return {
    title: proyecto.title,
    location_label: proyecto.location_label,
    employer_name: proyecto.client_name,
  };
}

// La tarjeta de la lista es un RESUMEN, como en Empleos y Promociones: qué
// necesitan, de qué servicio, dónde y cuándo se pidió. La descripción, escribir
// y guardar viven dentro, en la ficha — la tarjeta de un empleo tampoco cuenta
// la vacante entera, y con el texto puesto cada tarjeta medía distinto según lo
// que escribió quien publicó.
//
// Antes cada tarjeta traía la descripción larga y sus dos botones, así que el
// tablero era una pared de botones verdes y un proyecto con mucho texto se
// comía la pantalla entero. Y escribirle a alguien por WhatsApp no es un gesto
// que uno quiera ofrecer sobre algo que apenas se ojeó: cuesta un mensaje y la
// primera impresión. Se decide adentro, con el proyecto leído.
function Tarjeta({ proyecto, en, elegida = false, onElegir }: { proyecto: ProyectoPublico; en: boolean; elegida?: boolean; onElegir?: () => void }) {
  const copy = COPY[en ? "en" : "es"];
  return (
    <Link
      href={`/proyectos/${proyecto.id}`}
      // En computadora la ficha se abre AL LADO, como en Empleos y
      // Promociones: la tarjeta la elige sin salir de la lista. En el teléfono
      // no hay lado, así que sigue abriendo su pantalla.
      onClick={(e) => {
        if (!onElegir || !window.matchMedia("(min-width: 1024px)").matches) return;
        e.preventDefault();
        onElegir();
      }}
      aria-current={elegida ? "true" : undefined}
      className={cn(
        "block border-b border-[#e5e7eb] bg-white px-4 py-3.5 transition sm:max-lg:last:border-b-0 hover:bg-[#f8fafc] sm:px-5",
        elegida && "lg:bg-[#eef9fd] lg:shadow-[inset_4px_0_0_#162543]",
      )}
    >
      {/* El título en azul de enlace, igual que en Empleos: es lo único que
          dice «esto se abre». En azul marino la fila se leía como un dato más y
          nada invitaba a tocarla. */}
      <div className="flex min-w-0 items-start gap-3">
        <FotoDeQuienPublica proyecto={proyecto} />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-base font-extrabold leading-snug text-[#005eaa]">{proyecto.title}</h2>
          <p className="mt-0.5 truncate text-sm font-semibold text-[#101d35]">
            {proyecto.category_name ?? copy.titulo}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-[#52627a]">
            {proyecto.location_label || copy.todoElPais}
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-[#8794a7]">
            {/* PRIMER NOMBRE Y PRIMER APELLIDO. «Pedro Alejandro Saborío
                Matamoros» no cabe en la fila y salía cortado con puntos
                suspensivos, que es un nombre a medias: no dice quién es. */}
            <span className="min-w-0 truncate">{copy.publicado} {formatPersonDisplayName(proyecto.client_name, "mobile")}</span>
            <span className="shrink-0">{cuandoSePublico(proyecto.created_at, en)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function ProjectsBoard({
  proyectos,
  currentUserId,
  detalle = null,
  volverA = null,
  misProyectos = [],
}: {
  proyectos: ProyectoPublico[];
  currentUserId: string | null;
  detalle?: ProyectoPublico | null;
  /** Dirección de regreso que trajo la ficha (`?from=`), validada antes de usarse. */
  volverA?: string | null;
  /** Los que publicó quien mira: su ficha no ofrece escribirse ni guardarse. */
  misProyectos?: string[];
}) {
  const locale = marketplaceLocale(useLocale());
  const en = locale === "en";
  const copy = COPY[locale];
  // Se puede llegar con la búsqueda puesta en la dirección, como en Empleos y
  // Promociones: un enlace a /proyectos?q=fontaneria tiene que abrir ya
  // filtrado, si no el enlace miente.
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [lugar, setLugar] = useState(() => searchParams.get("location")?.trim() ?? "");
  // La misma línea de arriba que Empleos y Promociones: aparece al bajar, no
  // desde el primer momento. Proyectos la traía siempre puesta y de otro gris,
  // así que la misma barra se veía distinta según la sección.
  const { cabeceraRef, conLinea } = useHairlineOnScroll();
  // La ficha que se ve a la derecha en computadora. Llegando por
  // /proyectos/[id] es esa; si no, la primera de la lista.
  const [elegidoId, setElegidoId] = useState<string | null>(detalle?.id ?? null);
  // Editar el proyecto propio, igual que en Empleos y Promociones: el mismo
  // formulario de publicar, con lo escrito puesto.
  const [editando, setEditando] = useState<ProyectoPublico | null>(null);
  const router = useRouter();
  function elegir(id: string) {
    setElegidoId(id);
    // La dirección sigue a la ficha, para que se pueda compartir o recargar.
    const base = window.location.pathname.replace(/\/proyectos(?:\/[^/]*)?$/, "/proyectos");
    window.history.replaceState(null, "", `${base}/${id}${window.location.search}`);
  }

  // Los servicios que de verdad hay en el tablero, no el catálogo entero: se
  // ofrecen como sugerencias del buscador, que es donde se escribe el servicio.
  const serviciosSugeridos = useMemo(() => {
    const vistos = new Set<string>();
    for (const proyecto of proyectos) if (proyecto.category_name) vistos.add(proyecto.category_name);
    return [...vistos].sort((a, b) => a.localeCompare(b, "es"));
  }, [proyectos]);

  // UN filtro, no cuatro: de un proyecto solo se sabe el servicio, la zona y
  // cuándo se publicó, y los dos primeros ya son el buscador. La fecha es lo
  // único que no se puede escribir —y lo que más le importa a quien busca
  // trabajo: un pedido de hoy vale más que uno de hace un mes—. Inventar más
  // filtros sería poner controles que no tienen qué filtrar.
  const [publicado, setPublicado] = useState("all");
  const [ahora, setAhora] = useState(0);
  useEffect(() => { queueMicrotask(() => setAhora(Date.now())); }, []);
  const filtrados = useMemo(() => {
    const termino = query.trim().toLowerCase();
    const zona = lugar.trim().toLowerCase();
    return proyectos.filter((p) => {
      if (publicado !== "all" && ahora > 0 && ahora - new Date(p.created_at).getTime() > Number(publicado) * 86_400_000) return false;
      // Sin zona escrita, un proyecto «Todo Costa Rica» entra en cualquier
      // búsqueda: no tiene lugar contra el cual comparar.
      if (zona && !(p.location_label ?? "").toLowerCase().includes(zona)) return false;
      if (!termino) return true;
      return `${p.title} ${p.description} ${p.category_name ?? ""} ${p.location_label ?? ""}`.toLowerCase().includes(termino);
    });
  }, [ahora, lugar, proyectos, publicado, query]);
  const filtros = conFiltroDeFecha(proyectos.length) ? (
    <MarketplaceFilterChip
      label={copy.fecha}
      value={publicado}
      onChange={setPublicado}
      options={[["all", copy.cualquierFecha], ["1", copy.hoy], ["7", copy.semana], ["30", copy.mes]]}
    />
  ) : null;

  const lugaresSugeridos = useMemo(
    () => [...new Set(proyectos.map((p) => p.location_label?.trim()).filter((v): v is string => Boolean(v)))],
    [proyectos],
  );


  const buscador = (
    <MarketplaceSearch
      value={query}
      onChange={setQuery}
      placeholder={copy.buscar}
      suggestions={serviciosSugeridos}
      recentStorageKey="ccr-project-search-recents"
      visitSurface="proyectos"
      // La misma pareja que en /buscar: servicio y ubicación, nada más. Los
      // chips de servicio debajo preguntaban lo mismo por segunda vez.
      secondary={{
        value: lugar,
        onChange: setLugar,
        placeholder: copy.ubicacion,
        ariaLabel: copy.ubicacion,
        suggestions: lugaresSugeridos,
        icon: "location",
        clearLabel: en ? "Clear location" : "Limpiar ubicación",
      }}
    />
  );

  // Mismo trato que en Empleos y Promociones: la acción de publicar es una
  // pastilla compacta al lado de «Mis proyectos», no un bloque azul a lo ancho.
  // Quien entra aquí viene a LEER lo que la gente necesita; publicar es la
  // acción del otro lado del mostrador.
  const acciones = (
    // Dos columnas solo cuando hay dos botones: sin sesión queda uno solo, y en
    // una rejilla de dos se quedaba a media pantalla mientras que en Empleos y
    // Promociones ocupa todo el ancho.
    <div className={currentUserId ? "grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center [&>*]:w-full sm:[&>*]:w-auto" : "flex w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto"}>
      {currentUserId && (
        <Link
          href="/dashboard/profesional?tab=sent_projects"
          className="inline-flex h-9 items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-3 text-[13px] font-bold text-[#162543] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb] lg:h-11 lg:whitespace-nowrap lg:px-5 lg:text-sm"
        >
          {copy.misProyectos}
        </Link>
      )}
      <Link
        // `desde` viaja para que la flecha de atrás devuelva AQUÍ y no deje a
        // la persona dentro del panel, en una lista que no fue a buscar.
        href="/publicar-proyecto?desde=proyectos"
        className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-full bg-[#009fd9] px-3 text-[13px] font-bold text-white transition hover:bg-[#008fc3] lg:h-11 lg:px-6 lg:text-sm"
      >
        {copy.publicar}
      </Link>
    </div>
  );

  return (
    // El MISMO lienzo que Empleos y Promociones. Proyectos se quedaba con el
    // gris del cuerpo y las tres pantallas hermanas tenían dos fondos distintos.
    // En el teléfono el lienzo es BLANCO, el mismo blanco de la lista: con el
    // gris debajo, al terminar las tarjetas quedaba una franja gris suelta
    // entre la última y el pie —un fondo que solo se ve donde no hay nada—. En
    // pantalla grande el gris sí hace falta: ahí la lista es una tarjeta que
    // flota y necesita algo detrás.
    // Con dirección propia (/proyectos/[id]) la pantalla es una PÁGINA que se
    // desplaza sobre gris, como la de un empleo o una promoción; sin ella es un
    // tablero de alto fijo con la lista y la ficha lado a lado.
    <main className={cn(
      "min-h-[calc(100vh-72px)] bg-white text-[#162543] sm:bg-[#fafafa]",
      detalle
        ? "lg:bg-[#f4f7fa]"
        // El tablero no desplaza la página: se desplaza la lista, como en
        // Empleos y Promociones (regla data-ccr-tablero-fijo en layout.tsx).
        : "ccr-tablero-fijo lg:flex lg:h-[calc(100dvh-64px)] lg:min-h-0 lg:flex-col lg:overflow-hidden lg:bg-white",
    )}>
      <section
        ref={cabeceraRef}
        className={cn(
          "ccr-cabecera-pegada ccr-marketplace-sticky sticky top-0 z-20 border-b bg-white transition-colors duration-200 lg:hidden",
          conLinea ? "border-[#e5e7eb]" : "border-transparent",
        )}
      >
        {/* Dentro de una ficha la barra es la de una ficha, igual que en Empleos
            y Promociones: flecha para volver, el nombre de la pantalla y, a la
            derecha, guardar. «Volver a proyectos» era un enlace suelto dentro
            del contenido, que es donde nadie busca cómo salir. */}
        {detalle ? (
          <div className={CABECERA_FILA_CENTRADA}>
            <Link
              // Desde el panel, la flecha devuelve a la lista exacta de donde
              // se vino (pestaña y etapa); sin origen, al tablero.
              href={safeMarketplaceReturnHref(volverA, "/proyectos")}
              aria-label={copy.volver}
              className={cn("absolute left-4", CABECERA_BOTON)}
            >
              <ArrowLeft className={cn(CABECERA_GLIFO, "stroke-[2.4]")} />
            </Link>
            <h1 className={cn(CABECERA_TITULO, "text-center")}>{copy.ficha}</h1>
            {/* Guardar y compartir juntos dentro del «...», igual que en
                Empleos y Promociones. Abajo queda solo lo que contacta. */}
            <MenuProyecto
              grande
              className="absolute right-3"
              proyectoId={detalle.id}
              titulo={detalle.title}
              guardar={misProyectos.includes(detalle.id) ? undefined : { snapshot: retrato(detalle), userId: currentUserId }}
              clienteNombre={detalle.client_name}
              esPropio={misProyectos.includes(detalle.id)}
            />
          </div>
        ) : (
        <div className={CABECERA_FILA}>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("ccr:open-mobile-menu"))}
            aria-label={copy.abrirMenu}
            className={CABECERA_BOTON}
          >
            <Menu className="h-5 w-5" strokeWidth={2.5} />
          </button>
          <Link href="/" aria-label="ContrataCR inicio" className="shrink-0">
            <ContrataCRMark />
          </Link>
          <h1 className={CABECERA_TITULO}>{copy.titulo}</h1>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {/* Sin sesión va la cuenta; la campana queda para quien ya entró. */}
            {currentUserId ? <NotificationBell scope="all" /> : <HeaderAccountLink />}
          </div>
        </div>
        )}
        {!detalle && (
          <>
            <div className="px-4 pb-3">{buscador}</div>
            {filtros && <ScrollRail className="ccr-chip-row flex gap-1 px-4 pb-3 sm:gap-1.5">{filtros}</ScrollRail>}
            <div className="px-4 pb-3">{acciones}</div>
          </>
        )}
      </section>

      <MarketplaceNavbarPortal>
        <section className="hidden h-full bg-transparent lg:block">
          <div className="flex h-full w-full items-center py-2"><div className="w-full">{buscador}</div></div>
        </section>
      </MarketplaceNavbarPortal>

      <div className={cn("relative z-30 hidden shrink-0 border-b border-[#e5e7eb] bg-white", !detalle && "lg:block")}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-2.5">
                      {/* SIN RAYA ENTRE EL TÍTULO Y LOS FILTROS. Separaba dos cosas que
                no compiten: el nombre de la sección es texto y los filtros son
                pastillas con contorno, así que ya se distinguen solos. Era
                además la única raya vertical del app —todo lo demás separa en
                horizontal o con aire— y el aire que ya hay basta. */}
<div className="flex shrink-0 items-baseline gap-2 pr-4">
            {/* El nombre de la pantalla, a la vista: antes era solo para lectores
                de pantalla y la barra arrancaba en frío con los filtros —quien
                llegaba de Google no sabía en qué sección estaba—.
                EL CONTEO SOLO CUANDO DICE ALGO: «cuántos quedaron» tras buscar o
                filtrar. Sin filtros es el inventario entero, un dato que no le
                sirve a nadie y que le compite al título; en el teléfono ya se
                hacía así y en computadora no. Y la raya divisoria solo si hay
                filtros al otro lado: sin ellos separaba el título de la nada. */}
            <h1 className="text-[17px] font-extrabold text-[#162543]">{copy.titulo}</h1>
            {(query.trim() || lugar.trim()) && filtrados.length > 0 && (
              <span className="text-[13px] font-semibold text-[#68778d]">
                {copy.cuenta(filtrados.length)}{lugar.trim() ? ` · ${lugar.trim()}` : ""}
              </span>
            )}
          </div>
          {filtros && <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 overflow-visible">{filtros}</div>}
          <div className="flex shrink-0 gap-2">{acciones}</div>
        </div>
      </div>

      {(() => {
        const elegido = (elegidoId ? filtrados.find((p) => p.id === elegidoId) ?? (detalle?.id === elegidoId ? detalle : null) : null) ?? filtrados[0] ?? null;
        // En el teléfono: con /proyectos/[id] se ve SOLO la ficha; si no, solo
        // la lista. En computadora, las dos a la vez.
        const fichaEnMovil = !!detalle;
        const ficha = fichaEnMovil ? detalle : elegido;
        return (
          // El MISMO armado que Empleos y Promociones en computadora: fondo
          // blanco, la lista y la ficha pegadas a la barra de filtros, y un solo
          // borde donde se juntan. Antes Proyectos era una tarjeta angosta
          // flotando sobre gris, y la ficha se abría en otra pantalla.
          <div className={cn(
            "mx-auto w-full max-w-7xl px-0 py-0 sm:max-w-[46rem] sm:px-6 sm:py-5 lg:px-6",
            // Las MISMAS medidas que la página de un empleo: 6xl de ancho y la
            // ficha centrada en 760 px con su tarjeta de 320 al lado.
            detalle ? "lg:max-w-6xl lg:pb-8 lg:pt-8" : "ccr-tablero-cuerpo lg:max-w-7xl lg:min-h-0 lg:flex-1 lg:py-0",
          )}>
            {/* La salida, arriba y a la izquierda, con la misma forma que en
                Empleos y Promociones. */}
            {/* En computadora no hay flecha de volver: la del navegador ya
                está y hace lo mismo. Ver la nota de la ficha de una promoción. */}
            <div className={cn(
              "ccr-panel-tablero sm:overflow-hidden sm:rounded-[22px] sm:border sm:border-[#e5e7eb] sm:bg-white sm:shadow-[0_12px_34px_-28px_rgba(15,23,42,0.55)]",
              detalle
                // `ccr-ficha-pagina`: las rayas verticales del tablero las pone
                // una regla del documento (layout.tsx), que le gana a
                // `lg:border-0`. En una PÁGINA de ficha no hay dos columnas que
                // separar, y esa raya quedaba suelta a la derecha de la tarjeta,
                // bajando por el gris hasta el final.
                // FLEX CON UTILIDADES NORMALES, no una rejilla con valor
                // arbitrario: `lg:grid-cols-[minmax(0,1fr)_320px]` depende de
                // que Tailwind genere esa clase, y donde no la generó quedaba
                // `lg:grid` con UNA columna y las dos tarjetas salían apiladas.
                ? "ccr-ficha-pagina lg:flex lg:items-start lg:gap-5 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none"
                : "lg:h-full",
              // UNA DIRECCIÓN PROPIA ABRE UNA PÁGINA PROPIA, como en Empleos y
              // Promociones: /proyectos/[id] muestra SOLO el proyecto, también
              // en computadora. Con la lista al lado, «Ver proyecto» desde el
              // panel devolvía al tablero con algo seleccionado, no a la ficha.
              !detalle && "ccr-tablero-marco",
              !detalle && filtrados.length > 0 && "lg:grid lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]",
              fichaEnMovil && "max-sm:overflow-visible max-sm:border-0 max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none",
            )}>
              <section className={cn(
                "min-w-0 bg-white lg:h-full lg:overflow-y-auto",
                filtrados.length > 0 && "ccr-lista-tablero",
                detalle && "hidden",
              )}>
                {/* El conteo va DENTRO de la lista, con su línea, igual que en
                    Empleos: solo cuando se buscó o se filtró. */}
                {filtrados.length > 0 && (query.trim() || lugar.trim()) && (
                  <div className="border-b border-[#e5e7eb] px-4 py-3 lg:hidden">
                    <p className="font-bold">{copy.cuenta(filtrados.length)}</p>
                    {lugar.trim() && <p className="text-xs text-[#68778d]">{lugar.trim()}</p>}
                  </div>
                )}
                {filtrados.length === 0 ? (
                  // El MISMO vacío que Empleos y Promociones: plano, mismo
                  // texto y una salida. Este decía «Probá otra búsqueda» —el
                  // único en voseo del app— y no ofrecía cómo volver.
                  // En computadora la lista ocupa el alto entero de la pantalla:
                  // con el vacío midiendo sus 20rem de siempre, el aviso quedaba
                  // arriba de una losa blanca enorme y parecía que la página se
                  // había cortado. Ocupando el alto disponible se centra, que es
                  // lo que hace que un vacío se lea como una respuesta y no como
                  // un error de dibujo.
                  <PanelEmptyState
                    className="lg:min-h-full"
                    plano
                    icon={ClipboardList}
                    title={proyectos.length === 0 ? copy.vacio : copy.sinResultados}
                    description={proyectos.length === 0 ? copy.vacioSub : copy.sinResultadosSub}
                    action={proyectos.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => { setQuery(""); setLugar(""); setPublicado("all"); }}
                        className="inline-flex items-center justify-center rounded-full border border-[#b9d9e8] bg-white px-5 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]"
                      >
                        {copy.verTodos}
                      </button>
                    ) : undefined}
                  />
                ) : (
                  <div>
                    {filtrados.map((proyecto) => (
                      <Tarjeta key={proyecto.id} proyecto={proyecto} en={en} elegida={elegido?.id === proyecto.id} onElegir={() => elegir(proyecto.id)} />
                    ))}
                  </div>
                )}
              </section>
              {ficha && (
                <section className={cn(
                  "min-w-0",
                  !fichaEnMovil && "max-lg:hidden",
                  detalle
                    ? "lg:min-w-0 lg:flex-1"
                    : cn("lg:h-full lg:overflow-y-auto lg:bg-white", filtrados.length === 0 && "lg:col-span-2"),
                )}>
                  {/* Sin la lista al lado, la ficha no se estira a lo ancho de
                      la pantalla: el ancho de lectura se queda, como en la
                      página de un empleo. */}
                  <div className={cn("mx-auto w-full px-0 pt-0 sm:px-6 sm:pb-10", detalle ? "lg:max-w-none lg:px-0 lg:pb-0" : "lg:max-w-none lg:p-0")}>
                    <article className={cn(
                      "relative bg-white px-5 pt-6 max-sm:pb-6 sm:p-7",
                      detalle && "lg:rounded-lg lg:border lg:border-[#e5e7eb]",
                    )}>
                      {/* En computadora no hay barra de ficha: guardar y compartir
                          van en la esquina, a la altura del título, como en Empleos. */}
                      {/* El mismo encabezado que la ficha de un empleo: ícono, título,
                          de qué es, y dónde y cuándo. «Publicado por…» es un dato
                          del encabezado; al pie, con su propia línea, era un
                          renglón huérfano debajo de la descripción. */}
                      <div className="flex items-start gap-4">
                        <FotoDeQuienPublica proyecto={ficha} grande />
                        <div className="min-w-0 flex-1">
                          {/* Quién publica va PRIMERO y, al final de esa misma
                              línea, el «···» con compartir adentro —el orden de
                              LinkedIn—. El título va debajo, a todo el ancho. */}
                          <div className="flex min-w-0 items-center gap-2">
                            {/* Arriba, quien publica —nombre completo y foto—,
                                igual que el empleador en Empleos y el
                                profesional en Promociones. Con solo el nombre de
                                pila la línea no decía nada; con el nombre
                                entero y la cara, el profesional sabe a quién le
                                va a contestar. */}
                            {/* `flex-1`: el nombre se queda con el espacio libre
                                en vez de que se lo lleve un separador vacío. Con
                                un `<span className="flex-1" />` al lado, el hueco
                                crecía y el nombre se recortaba primero: «Mateo
                                Herrera Solís» salía como «Mateo…» teniendo medio
                                renglón de sobra. */}
                            <p className="min-w-0 flex-1 truncate font-semibold text-[#52627a]">
                              {ficha.client_name}
                            </p>
                            {/* SIN MARCA «Tu proyecto» EN LA FICHA. La tarjeta
                                de acciones ya lo dice más fuerte que una
                                etiqueta: donde en una ajena dice «WhatsApp» y
                                «Guardar», en la propia dice «Administrar». Es
                                exactamente como se sabe en Empleos y en
                                Promociones, que no llevan marca en ninguna
                                parte. Era lo único que hacía distinta a esta
                                sección. */}
                            <MenuProyecto grande className="-my-2.5 -mr-2 hidden shrink-0 lg:block" proyectoId={ficha.id} titulo={ficha.title} guardar={misProyectos.includes(ficha.id) ? undefined : { snapshot: retrato(ficha), userId: currentUserId }} clienteNombre={ficha.client_name} esPropio={misProyectos.includes(ficha.id)} />
                          </div>
                          <h2 className="mt-0.5 text-2xl font-extrabold leading-tight text-[#162543]">{ficha.title}</h2>
                          {/* El rubro se toca y filtra: «ver más de esto» sin
                              escribirlo. Un chip aparte preguntaba lo mismo que
                              el buscador, que ya sugiere los rubros del tablero. */}
                          {ficha.category_name && (
                            <button type="button" onClick={() => setQuery(ficha.category_name ?? "")} className="mt-1 inline-flex font-semibold text-[#008fc3] hover:underline">
                              {ficha.category_name}
                            </button>
                          )}
                          {/* Dónde y cuándo viven en la rejilla de datos de abajo;
                              aquí salían otra vez, palabra por palabra. */}
                        </div>
                      </div>
                      {/* COMPUTADORA: las acciones van justo debajo del título, en una
                          fila que se queda pegada arriba del panel al bajar por la
                          descripción. Antes estaban al final de la ficha y el «···»
                          flotaba solo en la esquina. */}
                      <div className={cn("sticky top-0 z-10 -mx-7 mt-4 hidden items-center gap-2 border-b border-[#eef2f6] bg-white px-7 py-3", !detalle && "lg:flex")}>
                        {misProyectos.includes(ficha.id) ? (
                          <Link
                            href={`/dashboard/profesional?tab=sent_projects&project=${ficha.id}`}
                            className="inline-flex h-12 items-center justify-center rounded-full border border-[#b9d9e8] px-6 text-base font-semibold text-[#007fae] transition hover:bg-[#f1f9fc]"
                          >
                            {copy.administrar}
                          </Link>
                        ) : (
                          <>
                            <BotonEscribir proyecto={ficha} className="w-auto min-w-[9.5rem] px-6" />
                            <SaveItemButton grande className="w-auto px-6" itemType="project" itemId={ficha.id} snapshot={retrato(ficha)} userId={currentUserId} />
                          </>
                        )}
                      </div>
                      {/* Los datos en rejilla de etiqueta y valor, la misma de la
                          ficha de un empleo. Aquí el servicio, la zona y la fecha
                          iban sueltos bajo el título y la ficha se quedaba sin el
                          bloque de datos que sí tienen empleos y promociones. */}
                      {/* UNA LÍNEA, NO DOS. La fila de acciones ya cierra con
                          su línea; si el bloque de datos abría con otra, quedaban
                          dos rayas separadas por 24 px de nada —y de dos grises
                          distintos—. De 1024 px en adelante, donde esa fila
                          existe, los datos arrancan bajo su línea. En el
                          teléfono no hay fila de acciones, así que ahí el bloque
                          sí pone la suya. Es la misma regla que ya usaba la
                          ficha de un empleo. */}
                      <dl className={cn("grid gap-3 border-b border-[#e5e7eb] pb-5 pt-5 text-sm sm:grid-cols-2 max-lg:mt-6 max-lg:border-t", detalle && "lg:mt-6 lg:border-t")}>
                        {([
                          [copy.filaServicio, ficha.category_name] as [string, string | null],
                          [copy.filaUbicacion, ficha.location_label || copy.todoElPais] as [string, string | null],
                          [copy.filaPublicado, cuandoSePublico(ficha.created_at, en)] as [string, string | null],
                        ].filter(([, valor]) => Boolean(valor)) as Array<[string, string]>).map(([etiqueta, valor]) => (
                          // En COMPUTADORA, en la página, el servicio es el
                          // titular de la tarjeta de la derecha: repetirlo aquí
                          // lo decía tres veces en la misma pantalla. En el
                          // teléfono no hay tarjeta al lado, así que se queda.
                          <div key={etiqueta} className={cn("min-w-0", detalle && etiqueta === copy.filaServicio && "lg:hidden")}>
                            <dt className="text-xs font-bold uppercase tracking-wide text-[#7a899d]">{etiqueta}</dt>
                            <dd className="mt-0.5 break-words font-bold text-[#162543] [overflow-wrap:anywhere]">{valor}</dd>
                          </div>
                        ))}
                      </dl>
                      <h3 className="mt-7 text-lg font-bold text-[#162543]">{copy.loQueNecesita}</h3>
                      {/* El texto no llega al borde de la tarjeta. A 892 px la línea
                          medía 110 caracteres y el ojo se pierde al saltar de
                          renglón; LinkedIn e Indeed usan entre 90 y 100. La
                          tarjeta se queda grande y el párrafo se lee. */}
                      <p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-[#43536b] [overflow-wrap:anywhere]">{ficha.description}</p>
                      {/* TELÉFONO: lo que contacta, en la franja de abajo; guardar
                          y compartir viven en el «···» de la barra de arriba. */}
                      {/* En la franja de abajo va lo que se hace con esta
                          ficha: escribirle a quien la publicó o, si es suya,
                          administrarla. */}
                      <AccionesAlPie className="mt-4 sm:max-w-xs lg:hidden">
                        {misProyectos.includes(ficha.id) ? (
                          <Link
                            href={`/dashboard/profesional?tab=sent_projects&project=${ficha.id}`}
                            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-[#b9d9e8] px-5 text-base font-semibold text-[#007fae] transition hover:bg-[#f1f9fc]"
                          >
                            {copy.administrar}
                          </Link>
                        ) : (
                          <BotonEscribir proyecto={ficha} />
                        )}
                      </AccionesAlPie>
                    </article>
                  </div>
                </section>
              )}
              {/* LA MISMA TARJETA QUE EN PROMOCIONES Y EMPLEOS: el dato que
                  define la publicación arriba, quién la puso, y debajo lo que
                  se hace con ella. En un proyecto el dato que define no es un
                  precio —no lo tiene— sino el servicio que se pide. */}
              {detalle && ficha && (
                <aside className="hidden h-fit w-80 shrink-0 rounded-lg border border-[#e5e7eb] bg-white p-5 lg:sticky lg:top-6 lg:block">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#7a899d]">{copy.ficha}</p>
                  <p className="mt-1 text-2xl font-extrabold leading-tight text-[#007fae]">{ficha.category_name || copy.titulo}</p>
                  {/* UNA SOLA LÍNEA EN LA TARJETA, la que separa los DATOS de
                      la ACCIÓN. Quién publicó es un dato más, igual que el
                      servicio de arriba: la raya entre los dos partía el bloque
                      de datos en dos por nada. Empleos ya tenía una sola. */}
                  <p className="mt-3 text-sm text-[#43536b]">
                    {copy.publicado} <span className="font-bold text-[#162543]">{ficha.client_name}</span>
                  </p>
                  <div className="mt-4 flex flex-col gap-2 border-t border-[#eef2f6] pt-4">
                    {misProyectos.includes(ficha.id) ? (
                      // Dos acciones, una a cada lado, con los rótulos cortos:
                      // la misma fila que la ficha de un empleo o una promoción.
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setEditando(ficha)}
                          className="inline-flex h-11 w-full min-w-0 items-center justify-center rounded-full bg-[#009fd9] px-3 text-sm font-bold text-white transition hover:bg-[#008fc3]"
                        >
                          <span className="truncate">{copy.editar}</span>
                        </button>
                        <Link
                          href={`/dashboard/profesional?tab=sent_projects&project=${ficha.id}`}
                          className="inline-flex h-11 w-full min-w-0 items-center justify-center rounded-full border border-[#b9d9e8] px-3 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]"
                        >
                          <span className="truncate">{copy.administrarCorto}</span>
                        </Link>
                      </div>
                    ) : (
                      <>
                        <BotonEscribir proyecto={ficha} />
                        <SaveItemButton grande itemType="project" itemId={ficha.id} snapshot={retrato(ficha)} userId={currentUserId} />
                      </>
                    )}
                  </div>
                </aside>
              )}
            </div>
          </div>
        );
      })()}
      {editando && (
        <PublishProjectModal
          editar={{
            id: editando.id,
            categoryId: editando.category_id ?? "",
            description: editando.description ?? "",
            provinciaId: editando.provincia_id ?? "",
            cantonId: editando.canton_id ?? "",
          }}
          onClose={() => setEditando(null)}
          // Recargar del servidor: el título lo vuelve a derivar el API, así
          // que lo que se ve tiene que venir de allá, no adivinarse aquí.
          onSuccess={() => router.refresh()}
        />
      )}
    </main>
  );
}
