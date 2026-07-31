# Ticket — tu app de finanzas personales

App para anotar gastos, ingresos e inversiones en segundos, desde el celular o la compu.

## Cómo queda organizado

- `index.html` — la estructura de la página
- `style.css` — el diseño visual
- `app.js` — la lógica (guardar, leer, borrar movimientos)
- `firebase-config.js` — **el único archivo que vas a editar vos** con los datos de tu cuenta

---

## Paso 1 — Crear tu base de datos (Firebase)

1. Andá a [console.firebase.google.com](https://console.firebase.google.com) y entrá con tu cuenta de Google.
2. Hacé clic en **"Agregar proyecto"**. Ponele un nombre (ej. "mis-finanzas") y crealo.
3. En el menú de la izquierda, andá a **Compilación → Authentication**. Hacé clic en **"Comenzar"** y activá el método **"Correo electrónico/contraseña"**.
4. Dentro de Authentication, pestaña **"Users"**, hacé clic en **"Agregar usuario"** y cargá tu propio email y una contraseña. Con esas vas a entrar a la app (nadie más las tiene).
5. En el menú de la izquierda, andá a **Compilación → Firestore Database**. Hacé clic en **"Crear base de datos"**, elegí **"Modo de producción"** y la ubicación que te sugiera (cualquiera sirve).
6. Una vez creada, andá a la pestaña **"Reglas"** y reemplazá todo por esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Esta única regla cubre todo lo que guarda la app (movimientos, categorías, presupuestos, recurrentes, deudas) y también lo que se agregue en el futuro — no vas a tener que volver a tocarla.

Esto hace que solo vos (con tu login) puedas leer o escribir tus propios datos. Hacé clic en **"Publicar"**.

7. Volvé a la página principal del proyecto (ícono de casita), hacé clic en el ícono **⚙️ → "Configuración del proyecto"**.
8. Bajá hasta **"Tus apps"** y hacé clic en el ícono **`</>`** (Web). Ponele un nombre (ej. "ticket-web") y registrala. **No hace falta Firebase Hosting.**
9. Te va a mostrar un bloque de código con `firebaseConfig = {...}`. Copiá esos valores y pegalos en el archivo `firebase-config.js` de esta carpeta, reemplazando los textos "PEGA_ACA...".

---

## Paso 2 — Subir el código a GitHub

1. Andá a [github.com](https://github.com) y creá un repositorio nuevo (botón verde **"New"**). Nombralo, por ejemplo, `mis-finanzas`. Dejalo público o privado, como prefieras.
2. En la página del repo recién creado, usá la opción **"uploading an existing file"** (subir archivos existentes) y arrastrá los 4 archivos de esta carpeta (`index.html`, `style.css`, `app.js`, `firebase-config.js` ya editado con tus datos).
3. Confirmá el commit ("Commit changes").

---

## Paso 3 — Publicar con Vercel

1. Andá a [vercel.com](https://vercel.com) y entrá con tu cuenta de GitHub.
2. Hacé clic en **"Add New... → Project"**.
3. Elegí el repositorio `mis-finanzas` que acabás de crear y hacé clic en **"Import"**.
4. No hace falta tocar ninguna configuración (es un sitio estático). Hacé clic en **"Deploy"**.
5. En un minuto vas a tener una URL tipo `mis-finanzas.vercel.app` — esa es tu app, accesible desde cualquier dispositivo.

Cada vez que subas un cambio a GitHub, Vercel va a actualizar la app sola.

---

## Agregarla a la pantalla de inicio del iPhone

1. Abrí tu app en **Safari** (tiene que ser Safari, no Chrome, para que funcione este paso en iPhone)
2. Tocá el botón de compartir (el cuadrado con la flecha hacia arriba)
3. Deslizá y elegí **"Agregar a pantalla de inicio"**
4. Confirmá el nombre y tocá **"Agregar"**

Va a quedar con su propio ícono (fondo oscuro con el "$") y, al abrirla, se ve como una app de verdad, sin la barra de direcciones de Safari arriba.

## Si algo no funciona

Ahora la app tiene una cajita de diagnóstico: al abrirla, vas a ver un recuadro negro con letras verdes en la parte de abajo de la pantalla. Ahí se muestra, en español simple, qué está pasando (si Firebase se conectó bien, si el login falló y por qué, etc.) — no hace falta abrir ninguna herramienta de desarrollador. Si algo falla, sacale una foto a ese recuadro y mandámela.

## Cómo se usa

- Elegís si es **Gasto**, **Ingreso** o **Inversión**.
- Tocás el monto (el teclado numérico se abre solo en el celular).
- Elegís una categoría (chip).
- Elegís la **forma de pago** (Efectivo, Débito, Crédito, Transferencia, Billetera virtual).
- Tocás **"Imprimir en el ticket"** — listo, queda guardado al instante.
- Arriba ves el balance del mes; abajo, el ticket de hoy y el historial por mes.

### Editar categorías

Al lado de "Categoría" hay un link **"Editar categorías"**. Al tocarlo se abre una lista de tus categorías actuales (para el tipo que tengas seleccionado: Gasto, Ingreso o Inversión), cada una con una **×** para eliminarla, y un campo para agregar una nueva. Los cambios se guardan solos y quedan disponibles en cualquier dispositivo donde entres con tu cuenta.

### Moneda (ARS / USD)

Al cargar un movimiento podés elegir si es en pesos o en dólares con los botones **ARS / USD**. El balance de arriba muestra un bloque separado para cada moneda (el bloque USD solo aparece si alguna vez cargaste algo en dólares) — no se mezclan ni se convierten entre sí.

### Rango de fechas personalizado

En "Historial", al lado del selector de mes hay un link **"Rango personalizado"**. Al tocarlo aparecen dos campos de fecha ("Desde" y "Hasta") — elegís las fechas y tocás **"Ver"** para filtrar el historial y el balance por ese período exacto. Con **"Volver a mes"** volvés a la vista normal por mes.

### Gastos e ingresos recurrentes

En la sección "Gastos e ingresos recurrentes", tocá **"Agregar"** para cargar algo que se repite todos los meses (alquiler, sueldo, un servicio fijo): elegís el tipo, un nombre, la categoría, el monto, la moneda y el día del mes en que querés que se cargue. A partir de ese día, cada mes la app te lo agrega sola al ticket — no hace falta que lo carges a mano. Podés borrar un recurrente en cualquier momento desde la lista.

### Editar formas de pago

Al lado de "Forma de pago" hay un link **"Editar formas de pago"** que funciona igual que el de categorías: podés agregar una nueva o borrar las que no uses, con una **×**. Se guarda en tu cuenta (usa el mismo permiso `config` que ya tenías habilitado, así que no hace falta tocar las reglas de Firestore de nuevo).

### Primera vez que entrás

La primera vez que entrás con una cuenta (o si tocás "Omitir" y volvés a entrar más tarde sin haberlo completado, no te lo vuelve a pedir una vez que lo guardás u omitís), la app te ofrece cargar lo que ya tenías: plata en efectivo o cuentas, inversiones existentes y deudas que ya arrastrabas. Es opcional — con **"Omitir por ahora"** entrás directo a la app vacía y podés cargar todo eso más adelante a mano, sin ningún problema. Esto solo aparece una vez por cuenta.

### Cuentas de varias personas

Ahora en la pantalla de login hay un link **"¿No tenés cuenta? Creá una"** — cualquiera puede crear su propio usuario con su email y contraseña, directamente desde la app (no hace falta que vos lo crees a mano en Firebase). Cada persona ve únicamente sus propios movimientos, categorías, formas de pago, presupuestos y recurrentes — la base de datos separa todo por cuenta y las reglas de Firestore impiden que una vea los datos de otra.

### Deudas

En la sección "Deudas", tocá **"Agregar deuda"** y elegí primero si **"Debo"** (le debés a alguien, ej. una tarjeta) o **"Me deben"** (alguien te debe a vos) — después completá nombre, monto total y moneda. Cada deuda muestra cuánto se pagó/cobró y cuánto queda pendiente: en rojo si vos debés, en verde si te deben a vos. El botón para registrar movimientos cambia a **"Pagar"** o **"Cobrar"** según el tipo, y ese movimiento también se anota solo en tu ticket (como gasto si pagás, como ingreso si cobrás), así impacta en tu balance del mes. Cuando el saldo llega a cero, se marca como "Saldada" o "Cobrada".

### Presupuesto por categoría

En "Presupuesto por categoría" vas a ver todas tus categorías de gasto con lo que llevás gastado este mes. Si le ponés un límite a una categoría, la app te avisa arriba (en el balance) apenas te pasás de ese monto. Dejar el campo vacío significa "sin límite".
