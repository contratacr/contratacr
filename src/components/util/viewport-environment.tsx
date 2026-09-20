"use client";

import { useEffect } from "react";

// Keeps CSS aware of the *visual* viewport. Mobile browsers can leave the layout
// viewport unchanged while the keyboard covers the screen, so fixed sheets that
// only use 100vh can end up behind the keyboard. These variables let shared
// modal/dropdown CSS size against the actually visible area without disabling
// user zoom.
export function ViewportEnvironment() {
  useEffect(() => {
    const root = document.documentElement;
    const timers = new Set<number>();

    const isEditable = (target: EventTarget | null): target is HTMLElement => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
      if (!(target instanceof HTMLInputElement)) return false;
      return !["button", "checkbox", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(target.type);
    };

    const keepFocusedFieldVisible = () => {
      const active = document.activeElement;
      if (!isEditable(active) || window.innerWidth > 768) return;
      const vv = window.visualViewport;
      // Arriba hay una cabecera fija de 64 px en casi todas las pantallas y en
      // las ventanas a pantalla completa: un campo «visible» debajo de ella no
      // se ve. Se deja además sitio para el rótulo del campo, que va encima.
      const visibleTop = (vv?.offsetTop ?? 0) + 64 + 36;
      const visibleBottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight) - 24;
      // UN HILO NO SE CENTRA. El chat y el caso de soporte se ajustan solos al
      // área visible (su panel mide lo que el teclado deja), así que el campo
      // de escribir ya queda encima del teclado. Centrarlo además lo arrastraba
      // y lo devolvía: ese es el «desplazamiento» que se veía al abrir el
      // teclado en un caso de soporte. El chequeo corre tres veces —a 0, 90 y
      // 260 ms— y en la primera el teclado todavía no encogió nada, así que la
      // segunda encontraba el campo «fuera» y lo movía.
      if (active.closest(".ccr-support-thread, .direct-chat-shell--thread")) return;
      const rect = active.getBoundingClientRect();
      if (rect.top >= visibleTop && rect.bottom <= visibleBottom) return;
      active.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    };

    const scheduleFocusedFieldCheck = () => {
      for (const delay of [0, 90, 260]) {
        const id = window.setTimeout(() => {
          timers.delete(id);
          keepFocusedFieldVisible();
        }, delay);
        timers.add(id);
      }
    };

    // En los chats a pantalla completa el WebView encoge también el viewport de
    // maquetación, así que innerHeight ya no sirve de referencia. Se recuerda el
    // alto sin teclado (el que hay cuando no se está escribiendo) y se mide contra él.
    let altoSinTeclado = window.visualViewport?.height ?? window.innerHeight;
    let tecladoAbierto = false;

    const update = () => {
      const vv = window.visualViewport;
      const height = vv?.height ?? window.innerHeight;
      const width = vv?.width ?? window.innerWidth;
      const top = vv?.offsetTop ?? 0;
      const left = vv?.offsetLeft ?? 0;
      const scale = vv?.scale ?? 1;
      if (!isEditable(document.activeElement) && height > altoSinTeclado) altoSinTeclado = height;
      // Dos formas de abrir teclado en el WebView: dejando el viewport de
      // maquetación quieto y tapando (se mide con innerHeight − alto − desfase),
      // o encogiéndolo y desplazándolo (se mide contra el alto sin teclado).
      const insetPorAltura = Math.max(0, altoSinTeclado - height);
      const insetPorDesplazamiento = Math.max(0, window.innerHeight - height - top);
      // SIN UN CAMPO ENFOCADO NO HAY TECLADO, midan lo que midan las alturas.
      // En Safari la barra de direcciones crece y encoge el viewport casi 100 px
      // por su cuenta: comparado contra «el alto más grande que se ha visto»,
      // eso pasaba por teclado abierto y la pantalla se quedaba acomodada para
      // un teclado que ya no estaba —el hilo de soporte a media pantalla, con
      // una franja gris arriba—.
      const hayCampoEnfocado = isEditable(document.activeElement);
      const keyboardInset = hayCampoEnfocado ? Math.max(insetPorAltura, insetPorDesplazamiento) : 0;

      root.style.setProperty("--app-visual-viewport-height", `${height}px`);
      root.style.setProperty("--app-visual-viewport-width", `${width}px`);
      root.style.setProperty("--app-visual-viewport-top", `${top}px`);
      root.style.setProperty("--app-visual-viewport-left", `${left}px`);
      root.style.setProperty("--app-visual-viewport-center-y", `${top + height / 2}px`);
      root.style.setProperty("--app-visual-viewport-scale", `${scale}`);
      root.style.setProperty("--app-keyboard-inset-bottom", `${keyboardInset}px`);
      root.toggleAttribute("data-keyboard-open", keyboardInset > 80);
      // Formulario LARGO con el teclado abierto: la franja de botones flotaba
      // encima del teclado y, con la cabecera, dejaba ~350 px para los campos.
      // Se retira mientras se escribe y vuelve al cerrar el teclado, como en
      // los formularios de iOS. En uno corto (un solo campo) se queda: ahí el
      // botón a mano es lo que sirve. «Largo» = lo que se desplaza no cabe en
      // lo que queda visible.
      let largo = false;
      if (keyboardInset > 80 && isEditable(document.activeElement)) {
        let caja: HTMLElement | null = document.activeElement.parentElement;
        while (caja && !(/(auto|scroll)/.test(getComputedStyle(caja).overflowY) && caja.scrollHeight > caja.clientHeight + 1)) caja = caja.parentElement;
        const alto = caja ? caja.scrollHeight : document.documentElement.scrollHeight;
        largo = alto > height + 120;
      }
      root.toggleAttribute("data-teclado-formulario-largo", largo);
      // Cualquier cosa que el sistema abra desde abajo (barra de accesorios o
      // teclado completo) tiene que retirar la barra de pestañas.
      root.toggleAttribute("data-keyboard-visible", keyboardInset > 24);
      if (keyboardInset > 80) scheduleFocusedFieldCheck();
      // AL CERRAR EL TECLADO, la página vuelve a su sitio. Safari en iPhone
      // desplaza el documento para dejar ver el campo y a veces lo deja así:
      // con un hilo a pantalla completa —soporte o chat— eso se veía como una
      // franja gris arriba y el pie descuadrado. Solo se toca cuando de verdad
      // acaba de cerrarse y hay un hilo abierto.
      const habiaTeclado = tecladoAbierto;
      tecladoAbierto = keyboardInset > 80;
      if (habiaTeclado && !tecladoAbierto && root.classList.contains("contratacr-chat-thread-open")) {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        window.setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }), 120);
      }
    };

    update();
    const vv = window.visualViewport;
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    document.addEventListener("focusin", scheduleFocusedFieldCheck);
    // AL SOLTAR EL CAMPO SE VUELVE A MEDIR, varias veces. Safari en iPhone no
    // siempre avisa del tamaño FINAL del viewport al cerrar el teclado —los
    // avisos llegan durante la animación y el último a veces no llega—, así que
    // las variables se quedaban con las medidas de «teclado abierto» hasta el
    // siguiente giro o toque. Se mide al instante y cuando la animación ya
    // terminó.
    const remedirAlSoltar = () => {
      for (const espera of [0, 120, 320, 650, 1000]) {
        const id = window.setTimeout(() => { timers.delete(id); update(); }, espera);
        timers.add(id);
      }
    };
    document.addEventListener("focusout", remedirAlSoltar);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", scheduleFocusedFieldCheck);
      document.removeEventListener("focusout", remedirAlSoltar);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return null;
}
