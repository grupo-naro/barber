"use client";

import { useActionState, useRef, useState, useTransition, type ChangeEvent } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-react";
import {
  deleteGalleryImage,
  moveGalleryImage,
  removeCoverImage,
  removeLogo,
  setCoverImage,
  setLogoImage,
  updateGalleryImageAlt,
  updateSocialLinks,
  uploadGalleryImage,
} from "@/server/actions/landing";
import type { ActionResult } from "@/lib/barbershop-settings";
import { GALLERY_ALT_MAX } from "@/lib/landing";
import { MAX_GALLERY_IMAGES } from "@/lib/media";
import type { LandingSettings, PublicGalleryImage } from "@/server/queries/landing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandColorsForm } from "./brand-colors-form";
import { FieldError, FormStatus } from "./form-ui";
import { resizeImage } from "./resize-image";

const ACCEPT = "image/jpeg,image/png,image/webp";

/** Achica la imagen en el navegador y la manda a la action como `file`. */
async function uploadResized(file: File, action: (formData: FormData) => Promise<ActionResult>): Promise<ActionResult> {
  let resized: File;
  try {
    resized = await resizeImage(file);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No pudimos procesar la imagen." };
  }
  const formData = new FormData();
  formData.set("file", resized);
  try {
    return await action(formData);
  } catch {
    return { ok: false, error: "No se pudo subir la imagen. Probá de nuevo." };
  }
}

async function safeCall(run: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await run();
  } catch {
    return { ok: false, error: "Algo salió mal. Probá de nuevo." };
  }
}

export function LandingForm({ landing }: { landing: LandingSettings }) {
  return (
    <div className="flex flex-col gap-8">
      <ImageSlot
        id="landing-logo"
        title="Logo"
        hint="Cuadrado, se ve chico arriba de tu página."
        url={landing.logoUrl}
        previewClass="size-20 rounded-xl"
        upload={setLogoImage}
        remove={removeLogo}
        uploadedMessage="Logo actualizado."
      />
      <ImageSlot
        id="landing-cover"
        title="Portada"
        hint="Foto horizontal grande para el encabezado de tu página."
        url={landing.coverUrl}
        previewClass="aspect-[16/9] w-full max-w-md rounded-xl"
        upload={setCoverImage}
        remove={removeCoverImage}
        uploadedMessage="Portada actualizada."
      />
      <Gallery images={landing.gallery} />
      <SocialForm landing={landing} />
      <BrandColorsForm primary={landing.brandPrimary} secondary={landing.brandSecondary} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logo y portada
// ---------------------------------------------------------------------------

function ImageSlot({
  id,
  title,
  hint,
  url,
  previewClass,
  upload,
  remove,
  uploadedMessage,
}: {
  id: string;
  title: string;
  hint: string;
  url: string | null;
  previewClass: string;
  upload: (formData: FormData) => Promise<ActionResult>;
  remove: () => Promise<ActionResult>;
  uploadedMessage: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ActionResult | undefined>();
  const [pending, startTransition] = useTransition();

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    startTransition(async () => {
      const result = await uploadResized(file, upload);
      setState(result.ok ? { ok: true, message: uploadedMessage } : result);
    });
  }

  function onRemove() {
    startTransition(async () => setState(await safeCall(remove)));
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${id}-title`}>
      <div>
        <h3 id={`${id}-title`} className="font-medium">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {url ? (
        // Imagen subida (o logo externo viejo): <img> nativo, sin optimización de next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`${title} actual`} className={`${previewClass} object-cover ring-1 ring-foreground/10`} />
      ) : (
        <div
          className={`${previewClass} flex items-center justify-center bg-muted text-muted-foreground ring-1 ring-foreground/10`}
        >
          <ImagePlus aria-hidden className="size-6" />
          <span className="sr-only">Sin {title.toLowerCase()}</span>
        </div>
      )}
      <input
        ref={inputRef}
        id={`${id}-file`}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={onFile}
        disabled={pending}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="lg" className="h-11 px-4" disabled={pending} onClick={() => inputRef.current?.click()}>
          {pending ? "Procesando…" : url ? `Cambiar ${title.toLowerCase()}` : `Subir ${title.toLowerCase()}`}
        </Button>
        {url ? (
          <Button type="button" variant="outline" size="lg" className="h-11 px-4" disabled={pending} onClick={onRemove}>
            Quitar
          </Button>
        ) : null}
      </div>
      <FormStatus state={state} pending={pending} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Galería
// ---------------------------------------------------------------------------

function Gallery({ images }: { images: PublicGalleryImage[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ActionResult | undefined>();
  const [progress, setProgress] = useState("");
  const [pending, startTransition] = useTransition();
  const full = images.length >= MAX_GALLERY_IMAGES;

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const remaining = MAX_GALLERY_IMAGES - images.length;
    const batch = files.slice(0, Math.max(0, remaining));
    const skipped = files.length - batch.length;

    startTransition(async () => {
      let uploaded = 0;
      const errors: string[] = [];
      for (const [i, file] of batch.entries()) {
        setProgress(`Subiendo ${i + 1} de ${batch.length}…`);
        const result = await uploadResized(file, uploadGalleryImage);
        if (result.ok) {
          uploaded++;
        } else {
          // En el celular los nombres suelen ser "image.jpg": mejor identificar por posición.
          errors.push(batch.length > 1 ? `Foto ${i + 1}: ${result.error}` : result.error);
          if (result.error.startsWith("Llegaste al máximo")) break;
        }
      }
      const lastError = errors.length ? errors.join(" ") : null;
      setProgress("");
      const parts: string[] = [];
      if (uploaded > 0) parts.push(uploaded === 1 ? "Se subió 1 foto." : `Se subieron ${uploaded} fotos.`);
      if (skipped > 0) parts.push(`Llegaste al máximo de ${MAX_GALLERY_IMAGES} fotos: ${skipped} no se subieron.`);
      if (lastError) parts.push(lastError);
      const message = parts.join(" ");
      setState(lastError || skipped > 0 ? { ok: false, error: message } : { ok: true, message });
    });
  }

  return (
    <section className="@container flex flex-col gap-3" aria-labelledby="landing-gallery-title">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="landing-gallery-title" className="font-medium">
          Fotos de tus trabajos
        </h3>
        <span className="text-sm text-muted-foreground tabular-nums" aria-label="Fotos subidas">
          {images.length}/{MAX_GALLERY_IMAGES}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Se muestran en tu página en este orden. Una descripción corta ayuda a quien usa lector de pantalla.
      </p>

      {images.length > 0 ? (
        // Columnas según el ancho real de la sección (container query), no del viewport: 2 columnas
        // recién con ≥512px de contenedor, así cada tarjeta tiene ≥248px y sus botones de 44px entran.
        <ul className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
          {images.map((image, index) => (
            <GalleryItem
              key={image.id}
              image={image}
              position={index + 1}
              isFirst={index === 0}
              isLast={index === images.length - 1}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Todavía no subiste fotos.
        </p>
      )}

      <input
        ref={inputRef}
        id="landing-gallery-file"
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={onFiles}
        disabled={pending || full}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          size="lg"
          className="h-11 px-4"
          disabled={pending || full}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus aria-hidden />
          {pending ? (progress || "Subiendo…") : full ? "Galería completa" : "Subir fotos"}
        </Button>
        {full ? (
          <p className="text-sm text-muted-foreground">
            Llegaste al máximo de {MAX_GALLERY_IMAGES} fotos. Borrá alguna para subir otra.
          </p>
        ) : null}
      </div>
      <FormStatus state={state} pending={pending} />
    </section>
  );
}

function GalleryItem({
  image,
  position,
  isFirst,
  isLast,
}: {
  image: PublicGalleryImage;
  position: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [alt, setAlt] = useState(image.alt ?? "");
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<ActionResult | undefined>();
  const [pending, startTransition] = useTransition();
  const prefix = `gallery-${image.id}`;
  const altError = state && !state.ok ? state.fieldErrors?.alt : undefined;

  function run(action: (formData: FormData) => Promise<ActionResult>, fields: Record<string, string>) {
    const formData = new FormData();
    formData.set("id", image.id);
    for (const [k, v] of Object.entries(fields)) formData.set(k, v);
    startTransition(async () => {
      const result = await safeCall(() => action(formData));
      setState(result);
      if (!result.ok) setConfirming(false);
    });
  }

  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-xl p-2 ring-1 ring-foreground/10" aria-busy={pending || undefined}>
      {/* Miniatura de una foto subida por la barbería: <img> nativo, sin optimización. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={image.alt ?? `Foto ${position}`}
        loading="lazy"
        className="aspect-square w-full rounded-lg bg-muted object-cover"
      />
      <form
        className="flex flex-col gap-1.5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run(updateGalleryImageAlt, { alt });
        }}
      >
        <Label htmlFor={`${prefix}-alt`} className="text-xs text-muted-foreground">
          Descripción (opcional)
        </Label>
        <div className="flex min-w-0 gap-2">
          <Input
            id={`${prefix}-alt`}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            maxLength={GALLERY_ALT_MAX}
            placeholder="Fade con barba"
            className="h-11 min-w-0 flex-1"
            aria-invalid={altError ? true : undefined}
            aria-describedby={altError ? `${prefix}-alt-error` : undefined}
          />
          <Button type="submit" variant="outline" size="lg" className="h-11 shrink-0 px-3" disabled={pending}>
            Guardar
          </Button>
        </div>
        <FieldError id={`${prefix}-alt-error`} message={altError} />
      </form>
      {/* Acciones: 3 botones de ícono de 44px (≈148px) en una fila que puede envolver. La
          confirmación del borrado va en su propia fila, con botones que se reparten el ancho y
          envuelven si no entran: nunca desborda la tarjeta, ni con 1 ni con 2 columnas. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-11"
          disabled={pending || isFirst}
          onClick={() => run(moveGalleryImage, { direction: "up" })}
          aria-label={`Mover la foto ${position} antes`}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-11"
          disabled={pending || isLast}
          onClick={() => run(moveGalleryImage, { direction: "down" })}
          aria-label={`Mover la foto ${position} después`}
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="icon-lg"
          className="ml-auto size-11"
          disabled={pending || confirming}
          onClick={() => setConfirming(true)}
          aria-label={`Borrar la foto ${position}`}
          aria-expanded={confirming}
          aria-controls={`${prefix}-confirm`}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      {confirming ? (
        <div
          id={`${prefix}-confirm`}
          role="group"
          aria-label={`Confirmar borrado de la foto ${position}`}
          className="flex flex-col gap-2 rounded-lg bg-destructive/10 p-2"
        >
          <p className="text-sm">¿Borrar esta foto? No se puede deshacer.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 min-w-0 flex-1 basis-24 px-3"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="h-11 min-w-0 flex-1 basis-24 px-3"
              disabled={pending}
              onClick={() => run(deleteGalleryImage, {})}
            >
              {pending ? "Borrando…" : "Sí, borrar"}
            </Button>
          </div>
        </div>
      ) : null}
      {state && !state.ok && !altError ? <p className="text-sm break-words text-destructive">{state.error}</p> : null}
      {state?.ok && state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Redes
// ---------------------------------------------------------------------------

function SocialForm({ landing }: { landing: LandingSettings }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(updateSocialLinks, undefined);
  const [values, setValues] = useState({
    instagram: landing.instagram ? `@${landing.instagram}` : "",
    googleMapsUrl: landing.googleMapsUrl ?? "",
  });
  // Al guardar, el input pasa a mostrar lo que normalizó el servidor (ej. un link pegado → @usuario).
  // Ajuste de estado durante el render cuando cambia el resultado (sin useEffect).
  const [syncedState, setSyncedState] = useState(state);
  if (state !== syncedState) {
    setSyncedState(state);
    if (state?.ok && state.values) {
      setValues({ instagram: state.values.instagram ?? "", googleMapsUrl: state.values.googleMapsUrl ?? "" });
    }
  }
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const bind = (field: keyof typeof values) => ({
    id: `social-${field}`,
    name: field,
    value: values[field],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [field]: e.target.value })),
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": `social-${field}-help${errors[field] ? ` social-${field}-error` : ""}`,
  });

  return (
    <form action={action} className="flex flex-col gap-4" noValidate aria-labelledby="landing-social-title">
      <h3 id="landing-social-title" className="font-medium">
        Redes y ubicación
      </h3>
      <div className="flex flex-col gap-2">
        <Label htmlFor="social-instagram">Instagram</Label>
        <Input
          {...bind("instagram")}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="@tubarberia"
          className="h-11"
        />
        <p id="social-instagram-help" className="text-xs text-muted-foreground">
          Tu usuario o el link a tu perfil.
        </p>
        <FieldError id="social-instagram-error" message={errors.instagram} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="social-googleMapsUrl">Link de Google Maps</Label>
        <Input
          {...bind("googleMapsUrl")}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://maps.app.goo.gl/…"
          className="h-11"
        />
        <p id="social-googleMapsUrl-help" className="text-xs text-muted-foreground">
          En Google Maps tocá “Compartir” y pegá el link. Si lo dejás vacío usamos tu dirección
          {landing.hasAddress ? "." : " (todavía no cargaste una en el perfil)."}
        </p>
        <FieldError id="social-googleMapsUrl-error" message={errors.googleMapsUrl} />
      </div>
      <p className="text-xs text-muted-foreground">
        El WhatsApp se edita en el{" "}
        <a href="#profile-whatsapp" className="underline underline-offset-4 hover:text-foreground">
          perfil
        </a>
        , más arriba.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" className="h-11 px-4" disabled={pending}>
          {pending ? "Guardando…" : "Guardar redes"}
        </Button>
        <FormStatus state={state} pending={pending} />
      </div>
    </form>
  );
}
