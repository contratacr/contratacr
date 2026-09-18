// La medida de TODA cabecera de pantalla, en un solo lugar.
//
// Había seis versiones de la misma barra: 56 px de alto en los tableros y 64 en
// el panel; el botón de la izquierda de 40 o de 44; su dibujo de 20, 24 o 28 px;
// y el título a 17, 18 o 21. Pasar de Empleos al panel movía el logo 12 px y
// cambiaba de tamaño la letra, en la misma esquina de la misma pantalla.
//
// La regla es una sola: la fila mide 64 px —lo que ya medía la barra principal,
// y lo que deja respirar un botón de 40 sin apretarlo—; el primer control es una
// caja de 40×40 que empieza a 16 px del borde, igual que el contenido de abajo;
// la marca, cuando está, queda a 64; y el título va a 17 px.
export const CABECERA_FILA = "flex min-h-16 items-center gap-2 px-4";

// La variante de ficha: flecha a la izquierda, título al centro. El relleno
// lateral deja sitio para los controles absolutos de los dos lados.
export const CABECERA_FILA_CENTRADA = "relative flex min-h-16 items-center justify-center px-14";

export const CABECERA_BOTON =
  "grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#162543] transition-colors hover:bg-[#eef5f9]";

export const CABECERA_TITULO = "min-w-0 truncate text-[17px] font-extrabold text-[#162543]";

// El dibujo dentro del botón: 20 px. Con 24 o 28 la flecha pesaba más que el
// título al que acompaña.
export const CABECERA_GLIFO = "h-5 w-5";

// Las tres columnas de la cabecera «flecha · título · hueco»: los lados iguales
// para que el título quede centrado de verdad. Como objeto de estilo y no como
// clase: ver la nota en `focused-header.tsx`.
export const COLUMNAS_CABECERA = { gridTemplateColumns: "56px minmax(0, 1fr) 56px" } as const;
