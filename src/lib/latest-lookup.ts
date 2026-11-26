// Búsqueda mientras se escribe: espera a que se deje de escribir y entrega solo el resultado de la última búsqueda.
// Sin React: quien la usa decide cuándo cancelar.

export type LatestLookup<Q, R> = {
  /** Busca `query` después de la espera y descarta cualquier búsqueda anterior, también la ya enviada. */
  search: (query: Q, onResult: (result: R | null) => void) => void;
  /** Descarta la búsqueda en espera o ya enviada. Después se puede volver a buscar. */
  cancel: () => void;
};

/** `onResult` recibe `null` si la búsqueda falla. */
export function createLatestLookup<Q, R>(lookup: (query: Q) => Promise<R>, delayMs: number): LatestLookup<Q, R> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Cada búsqueda tiene su número: comparar el texto no alcanza, porque se puede volver a buscar lo mismo.
  let current = 0;

  function cancel() {
    clearTimeout(timer);
    current++;
  }

  function search(query: Q, onResult: (result: R | null) => void) {
    cancel();
    const id = current;
    timer = setTimeout(async () => {
      let result: R | null = null;
      try {
        result = await lookup(query);
      } catch {
        // Sin resultado: quien busca sigue como si no hubiera buscado.
      }
      if (id === current) onResult(result);
    }, delayMs);
  }

  return { search, cancel };
}
