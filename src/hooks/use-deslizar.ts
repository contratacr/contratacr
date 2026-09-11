"use client";

import { useRef, type PointerEvent } from "react";

// Deslizar con el dedo (o arrastrar con el ratón) para pasar de imagen. Las
// galerías solo tenían flechas: en un teléfono nadie las busca, todo el mundo
// desliza. Se decide al soltar: un movimiento mayormente horizontal de al menos
// 40 px cuenta como gesto; uno vertical se deja pasar para que la página siga
// desplazándose con normalidad.
const UMBRAL_PX = 40;

export function useDeslizar(alDeslizar: (direccion: "anterior" | "siguiente") => void) {
  const inicio = useRef<{ x: number; y: number; id: number } | null>(null);

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    inicio.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const desde = inicio.current;
    inicio.current = null;
    if (!desde || desde.id !== event.pointerId) return;
    const dx = event.clientX - desde.x;
    const dy = event.clientY - desde.y;
    if (Math.abs(dx) < UMBRAL_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    alDeslizar(dx < 0 ? "siguiente" : "anterior");
  }

  function onPointerCancel() {
    inicio.current = null;
  }

  // Arrastrar con el ratón sobre una <img> arranca el "drag" nativo del
  // navegador, que cancela el gesto a medio camino: se apaga aquí para que el
  // arrastre también valga en la computadora.
  function onDragStart(event: { preventDefault(): void }) {
    event.preventDefault();
  }

  return { onPointerDown, onPointerUp, onPointerCancel, onDragStart };
}
