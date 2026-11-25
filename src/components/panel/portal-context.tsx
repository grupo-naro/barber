"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const PanelPortalContext = createContext<HTMLElement | null>(null);

/**
 * Nodo donde se montan las hojas. Va adentro de `.panel-theme`: un portal en `<body>` perdería los tokens y los
 * colores de la barbería.
 */
export function PanelPortalProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  return (
    <PanelPortalContext value={node}>
      {children}
      <div ref={setNode} data-panel-portal="" />
    </PanelPortalContext>
  );
}

/** `null` hasta que el layout del panel se monta. */
export function usePanelPortal(): HTMLElement | null {
  return useContext(PanelPortalContext);
}
