VERDICT: PASS

## Hallazgos
- [nit] `src/app/(dashboard)/billing-gate.tsx:150`: las filas de transferencia (alias, CBU) no tienen botón de copiar; en mobile hay que seleccionar el texto a mano → agregar un botón "Copiar" de ≥ 44px (client component chico) en una ronda futura.
- [nit] `src/app/(dashboard)/billing-gate.tsx:44`: la vista del barbero usa `role="alert"` en una pantalla estática; `role="status"` o nada alcanza → cambiar si molesta a lectores de pantalla.

## Revisado
Pantalla de pago bloqueada: 1 toque para pagar (Mercado Pago) y 1 para avisar por WhatsApp, sin formularios. Botones h-11 y w-full en mobile, con ícono aria-hidden. Copy en voseo rioplatense, fecha límite del banner en la timezone de la barbería. Hay estado de carga (Suspense con skeleton aria-busy), vista aparte para el barbero y mensaje cuando no hay medios de pago cargados. El header, "Mi cuenta" y "Cerrar sesión" siguen disponibles. Los h1/h2 están bien jerarquizados y los links externos usan rel noopener. No hay formularios nuevos, así que no aplican inputMode ni doble envío.
