VERDICT: PASS

## Hallazgos
- [nit] Hero con portada a 1024-1100px: la banda (w-56, `rotate-[28deg]`, `right-[6%]`) se inclina unos 300px en horizontal sobre la altura del hero, y el texto llega al 60% del ancho. Los bordes quedan casi tangentes en el tramo inferior izquierdo de la banda. Solo vi la captura de 1366, donde no hay choque, y no se probó 1024. Se puede asegurar con `lg:max-w-[55%] xl:max-w-[60%]` o con `lg:w-44 xl:w-56`. Además, el overlay degradado queda debajo de la banda, así que el contraste del texto no se ve afectado por ella.
- [nit] Con una portada real, la banda opaca tapa una franja de la foto. Es aceptable, porque es decorativa, `aria-hidden`, `pointer-events-none` y va en `-z-10` bajo el contenido. En `lg+` la zona de la foto queda parcialmente cubierta, lo cual es una decisión de diseño.
- [nit] El `not-found` real sigue sin el tema urbano. Es deuda conocida y está fuera de scope.

## Revisado
- Ronda 1: la banda a la derecha en el hero con portada (resuelta), la galería a 3 columnas sin hueco (resuelta), el CTA secundario oscuro con "Reservar turno" dominante, `--royal-claro` eliminado y los fonts con `latin-ext`.
- La animación del poste (`landing-pole-spin`) está dentro de `@media (prefers-reduced-motion: no-preference)`, así que con reduced motion queda estática.
- Capturas de mobile y desktop (1366) revisadas. En mobile la banda está oculta (`hidden lg:block`), así que no hay riesgo de colisión a 360 px.
