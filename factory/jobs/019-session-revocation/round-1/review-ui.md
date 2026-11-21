VERDICT: PASS

## Hallazgos
- [nit] `src/app/(auth)/login/page.tsx`: el aviso reutiliza exactamente las clases del aviso de suspensión (job 018): tokens `destructive`, `role="alert"`, `text-sm`, `p-3`, `mb-4`, sin colores crudos. Dark mode y 360px quedan igual que antes (texto envuelve, sin anchos fijos). Un aviso de "sesión expirada" es informativo y podría usar un estilo menos alarmante que el destructivo, pero es coherente y no bloquea.

## Revisado
Diff del login (avisos suspended/inactive/expired): consistencia de tokens, dark mode y mobile; sin otra superficie visual.
