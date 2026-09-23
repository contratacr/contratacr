"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn("relative isolate flex h-12 w-12 shrink-0 overflow-hidden rounded-full", className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

// La foto va como <img> de verdad, no como `AvatarPrimitive.Image`: ese no
// pinta NADA hasta que la imagen termina de cargar —ni en el servidor—, así que
// cada tarjeta salía primero con el círculo de iniciales y después saltaba a la
// foto, cambiando de nodo. Aquí la foto ya viene en el HTML (el navegador la
// pide mientras lee la página) y se pinta ENCIMA de las iniciales, que quedan
// debajo como relleno. No hay cambio de nodo ni salto de tamaño.
// El `z-10` vive dentro del avatar gracias al `isolate` de la raíz: sin él la
// foto le ganaba también a la insignia de la cámara que va ENCIMA del avatar
// (el panel del profesional), y el aro blanco salía mordido.
const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, src, ...props }, ref) => {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={typeof src === "string" ? src : undefined}
      loading="lazy"
      decoding="async"
      className={cn(
        "ccr-img-reveal absolute inset-0 z-10 aspect-square h-full w-full object-cover",
        className,
      )}
      {...(props as React.ImgHTMLAttributes<HTMLImageElement>)}
    />
  );
});
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-[#EBF5FB] text-[#009FD9] font-semibold text-sm",
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
