VERDICT: PASS

## Hallazgos
- [nit] `src/app/(dashboard)/dashboard/settings/landing-form.tsx` (SocialForm): al guardar Instagram/Maps el input queda con lo que tipeó el dueño y el mensaje es solo "Redes guardadas."; no se muestra el valor normalizado (ej. pegó un link y se guardó `@usuario`). → devolver el valor normalizado en el `ActionResult` y reflejarlo en el input, o decir "Guardamos @usuario".
- [nit] `resize-image.ts`: `createImageBitmap(file, { imageOrientation: "from-image" })` puede fallar en Safari/iOS viejos (opciones no soportadas) y cae en el mensaje "No pudimos leer esa imagen", sin fallback. → en el catch reintentar `createImageBitmap(file)` sin opciones (o vía `<img>`+canvas, que aplica EXIF por defecto en navegadores modernos).
- [nit] `ACCEPT` restringe a jpeg/png/webp: en iPhone Safari convierte HEIC a JPEG al elegir de la galería, así que anda; en cámara/galería de Android también. Un HEIC que igual llegue se rechaza con mensaje claro ("Probá con un JPG, PNG o WebP"). Correcto, sin cambios necesarios. Podrías sumar `capture` solo si querés abrir la cámara directo (no hace falta).
- [nit] Foto de la galería con error: el mensaje usa `file.name` (en iPhone suele ser `image.jpg`), poco informativo con varias fotos. → usar "Foto N: ...".
- [nit] WhatsApp no tiene input en este formulario (nota "se edita en el perfil, más arriba"); aceptable, pero un link ancla ayudaría.

## Revisado
Subir foto de galería: 2 toques (Subir fotos → elegir, multi-selección ok, tope 24, progreso "Subiendo i de n…", botón deshabilitado, errores de tipo/peso claros en español); logo/portada: 2 toques con preview, "Cambiar"/"Quitar" 44px; reordenar con flechas arriba/abajo (sin drag) y borrado con confirmación en 2 toques; EXIF orientation aplicada con `from-image` y reencodeo a WebP/JPEG ≤1600px bajo el límite de 3MB; Instagram/Maps con placeholders, `inputMode` y errores junto al campo.
