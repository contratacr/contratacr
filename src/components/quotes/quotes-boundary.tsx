"use client";

import { Component, type ReactNode } from "react";

/**
 * Si algo falla dentro de Cotizaciones, se cae SOLO esta sección con un aviso y
 * un botón de reintentar. Sin esto, cualquier error tumbaba la pantalla entera
 * del panel y salía el "Algo salió mal" de la app.
 */
type Props = { children: ReactNode; titulo: string; cuerpo: string; reintentar: string };
type State = { falló: boolean };

export class QuotesBoundary extends Component<Props, State> {
  state: State = { falló: false };

  static getDerivedStateFromError(): State {
    return { falló: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[cotizaciones] sección caída:", error);
  }

  render() {
    if (!this.state.falló) return this.props.children;
    return (
      <div className="rounded-3xl border border-[#e5eaf0] bg-white px-6 py-10 text-center shadow-sm">
        <h3 className="text-[18px] font-extrabold text-[#162543]">{this.props.titulo}</h3>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-[#52627a]">{this.props.cuerpo}</p>
        <button
          type="button"
          onClick={() => this.setState({ falló: false })}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-[#009FD9] px-6 text-[14px] font-bold text-white transition-colors hover:bg-[#0089bb]"
        >
          {this.props.reintentar}
        </button>
      </div>
    );
  }
}
