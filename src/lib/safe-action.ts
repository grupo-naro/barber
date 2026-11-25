// Fallo de red al llamar una Server Action, convertido en estado de error del formulario. Lógica pura.

/** La respuesta pudo perderse DESPUÉS de guardar: por eso pide verificar antes de repetir. */
export const NETWORK_ERROR_MESSAGE =
  "No se pudo confirmar. Revisá la conexión y fijate si quedó registrado antes de repetir.";

/**
 * Envuelve una acción de `useActionState`: si la llamada falla, devuelve `onError(prev)` en lugar de romper la
 * pantalla. `rethrow` (en la UI, `unstable_rethrow`) vuelve a lanzar los errores internos de Next, como las
 * redirecciones. No reintenta nunca.
 */
export function safeAction<S>(
  action: (prev: S, formData: FormData) => Promise<S>,
  onError: (prev: S) => S,
  rethrow: (error: unknown) => void,
): (prev: S, formData: FormData) => Promise<S> {
  return async (prev, formData) => {
    try {
      return await action(prev, formData);
    } catch (error) {
      rethrow(error);
      return onError(prev);
    }
  };
}
