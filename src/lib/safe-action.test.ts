import { describe, expect, it, vi } from "vitest";
import { NETWORK_ERROR_MESSAGE, safeAction } from "./safe-action";

describe("safeAction", () => {
  it("un fallo de red devuelve el estado de error", async () => {
    const run = safeAction(
      async () => {
        throw new TypeError("Failed to fetch");
      },
      () => "error",
      () => {},
    );
    expect(await run("antes", new FormData())).toBe("error");
  });

  it("deja pasar las redirecciones de Next", async () => {
    const redirect = new Error("NEXT_REDIRECT");
    const run = safeAction(
      async () => {
        throw redirect;
      },
      () => "error",
      (e) => {
        if (e === redirect) throw e;
      },
    );
    await expect(run("antes", new FormData())).rejects.toBe(redirect);
  });

  it("con respuesta del servidor devuelve su estado, sin tocar el error", async () => {
    const onError = vi.fn(() => "error");
    const action = vi.fn(async (prev: string, fd: FormData) => `${prev}:${String(fd.get("a"))}`);
    const fd = new FormData();
    fd.set("a", "1");
    expect(await safeAction(action, onError, () => {})("antes", fd)).toBe("antes:1");
    expect(action).toHaveBeenCalledExactlyOnceWith("antes", fd);
    expect(onError).not.toHaveBeenCalled();
  });

  it("el estado de error se arma con el anterior y el mensaje pide verificar antes de repetir", async () => {
    const run = safeAction(
      async (): Promise<string> => {
        throw new Error("x");
      },
      (prev) => `${prev}!`,
      () => {},
    );
    expect(await run("antes", new FormData())).toBe("antes!");
    expect(NETWORK_ERROR_MESSAGE).toBe(
      "No se pudo confirmar. Revisá la conexión y fijate si quedó registrado antes de repetir.",
    );
  });
});
