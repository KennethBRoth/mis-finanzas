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
    match /usuarios/{userId}/movimientos/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /usuarios/{userId}/config/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

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
