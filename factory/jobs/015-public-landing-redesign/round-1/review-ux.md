VERDICT: PASS

## Hallazgos
- [nit] `src/app/[slug]/hero.tsx` (mobile): en 390px "Reservar turno" (h-12, primario latón) queda visible sin scroll y el botón de WhatsApp va debajo como secundario outline; la jerarquía es correcta. Con descripción larga o dirección de dos líneas el CTA podría bajar, pero el hero usa min-h y no altura fija, así que no se corta.
- [nit] `src/app/[slug]/hero.tsx`: el enlace de Instagram tiene min-h-11 pero es solo texto sin padding horizontal; el área táctil real es angosta pero aceptable.
- [nit] `src/app/[slug]/services-section.tsx`: "Tocá un servicio para reservarlo directamente" es claro, pero la fila no tiene un indicio visual de que es tocable (flecha o chevron). Opcional.
- [nit] `src/app/[slug]/hours-section.tsx`: "hoy" resaltado con fondo y texto latón, buen contraste; los días cerrados en gris ceniza son legibles. Sin cambios.

## Revisado
Flujo desde Instagram en mobile: abrir, tocar "Reservar turno" (1) o un servicio en la lista (1, preselecciona y salta a #reservar), día (1), horario (1), completar form y confirmar (1): 4 toques más el formulario, igual que en 013 (la lista de servicios ahora ahorra el toque del servicio). El WhatsApp flotante se oculta (IntersectionObserver, aria-hidden, pointer-events none) mientras #reservar está en pantalla, así no tapa horarios ni "Confirmar reserva"; el scroll al form respeta reduced-motion. Estados vacíos: sin servicios, sin galería (sección omitida), sin horarios ni ubicación (sección omitida), sin portada (monograma de fallback), sin WhatsApp (botones omitidos); skeletons de carga presentes. Copy en voseo, precios con formatPrice, horarios en la zona de la barbería, alt en logo y galería.
