# Ticket — finanzas personales

App web para anotar gastos, ingresos e inversiones en segundos. Sitio estático (HTML + CSS + JS) con Firebase (Auth + Firestore), publicado en Vercel.

## Archivos

- `index.html` — estructura (4 pestañas: Cargar, Historial, Deudas, Más)
- `style.css` — diseño
- `app.js` — lógica
- `firebase-config.js` — datos de tu proyecto de Firebase
- `manifest.json` + íconos — para agregarla a la pantalla de inicio del iPhone

## Datos

Todo se guarda en `usuarios/{uid}/` en estas colecciones: `tk_movimientos`, `tk_recurrentes`, `tk_deudas` y `tk_config/ajustes` (categorías, formas de pago y presupuestos). Las reglas de Firestore existentes (`usuarios/{userId}/{document=**}`) ya las cubren.

Las colecciones de la versión anterior (`movimientos`, `recurrentes`, `deudas`, `config`) no se usan; se pueden borrar desde la consola de Firebase.

## Notas

- Las fechas se guardan en hora local (`YYYY-MM-DD` y `YYYY-MM`), así lo que cargás de noche cae en el día y mes correctos.
- Los recurrentes se generan con un id fijo por mes, por lo que no se pueden duplicar.
- Pagar/cobrar una deuda actualiza la deuda y crea el movimiento en una sola operación.
- No hay registro de cuentas nuevas: el usuario se crea a mano en Firebase → Authentication.
- Si algo falla al cargar, aparece un recuadro negro con el error arriba de la pantalla.
