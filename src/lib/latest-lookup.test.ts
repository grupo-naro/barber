import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLatestLookup } from "./latest-lookup";

const DELAY = 350;

/** Búsqueda que responde a mano: `answers[i]` es la de la llamada `i`. */
function setup() {
  const answers: { resolve: (value: string) => void; reject: (error: Error) => void }[] = [];
  const lookup = vi.fn<(query: string) => Promise<string>>(
    () => new Promise((resolve, reject) => answers.push({ resolve, reject })),
  );
  const onResult = vi.fn();
  return { answers, lookup, onResult, latest: createLatestLookup(lookup, DELAY) };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("createLatestLookup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("busca una vez, después de la espera, y entrega el resultado", async () => {
    const { answers, lookup, onResult, latest } = setup();
    latest.search("111", onResult);
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(lookup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(lookup.mock.calls).toEqual([["111"]]);
    answers[0].resolve("Ana");
    await flush();
    expect(onResult.mock.calls).toEqual([["Ana"]]);
  });

  it("escribir de nuevo durante la espera busca solo lo último", async () => {
    const { lookup, onResult, latest } = setup();
    latest.search("11", onResult);
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    latest.search("111", onResult);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(lookup.mock.calls).toEqual([["111"]]);
  });

  it("cancelar durante la espera no llama a la búsqueda", async () => {
    const { lookup, onResult, latest } = setup();
    latest.search("111", onResult);
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    latest.cancel();
    await vi.advanceTimersByTimeAsync(DELAY * 10);
    expect(lookup).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
  });

  it("cancelar con la búsqueda ya enviada descarta su resultado", async () => {
    const { answers, onResult, latest } = setup();
    latest.search("111", onResult);
    await vi.advanceTimersByTimeAsync(DELAY);
    latest.cancel();
    answers[0].resolve("Ana");
    await flush();
    expect(onResult).not.toHaveBeenCalled();
  });

  it("cancelar con la búsqueda ya enviada descarta también su falla", async () => {
    const { answers, onResult, latest } = setup();
    latest.search("111", onResult);
    await vi.advanceTimersByTimeAsync(DELAY);
    latest.cancel();
    answers[0].reject(new Error("red"));
    await flush();
    expect(onResult).not.toHaveBeenCalled();
  });

  it("una búsqueda nueva descarta la anterior aunque responda después", async () => {
    const { answers, onResult, latest } = setup();
    latest.search("111", onResult);
    await vi.advanceTimersByTimeAsync(DELAY);
    latest.search("222", onResult);
    await vi.advanceTimersByTimeAsync(DELAY);
    answers[1].resolve("Beto");
    await flush();
    answers[0].resolve("Ana");
    await flush();
    expect(onResult.mock.calls).toEqual([["Beto"]]);
  });

  it("descarta la respuesta vieja aunque después se busque el mismo teléfono", async () => {
    const { answers, lookup, onResult, latest } = setup();
    latest.search("111", onResult);
    await vi.advanceTimersByTimeAsync(DELAY);
    latest.cancel();
    latest.search("111", onResult);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(lookup).toHaveBeenCalledTimes(2);
    answers[0].resolve("vieja");
    await flush();
    expect(onResult).not.toHaveBeenCalled();
    answers[1].resolve("nueva");
    await flush();
    expect(onResult.mock.calls).toEqual([["nueva"]]);
  });

  it("si la búsqueda falla, entrega null", async () => {
    const { answers, onResult, latest } = setup();
    latest.search("111", onResult);
    await vi.advanceTimersByTimeAsync(DELAY);
    answers[0].reject(new Error("red"));
    await flush();
    expect(onResult.mock.calls).toEqual([[null]]);
  });

  it("si la búsqueda lanza antes de devolver la promesa, también entrega null", async () => {
    const onResult = vi.fn();
    const latest = createLatestLookup((): Promise<string> => {
      throw new Error("red");
    }, DELAY);
    latest.search("111", onResult);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(onResult.mock.calls).toEqual([[null]]);
  });

  it("después de cancelar se puede volver a buscar", async () => {
    const { answers, onResult, latest } = setup();
    latest.search("111", onResult);
    latest.cancel();
    latest.cancel();
    latest.search("222", onResult);
    await vi.advanceTimersByTimeAsync(DELAY);
    answers[0].resolve("Beto");
    await flush();
    expect(onResult.mock.calls).toEqual([["Beto"]]);
  });
});
