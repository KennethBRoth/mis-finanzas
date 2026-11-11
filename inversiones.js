// Ticket — pestaña Inversiones
// Foto de las posiciones abiertas en Balanz y de lo ya cerrado en Balanz e Invíu, con datos al 11/11/2026.
// Precios de partida: los del resumen de Balanz de hoy. Podés cambiarlos (se guardan en Firestore: usuarios/{uid}/tk_config/precios).
// Para actualizar posiciones o resultados cerrados, hay que reemplazar el bloque DATOS de este archivo.

import { firebaseConfig } from './firebase-config.js';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ====================== DATOS (foto al 11/11/2026) ====================== */

const DATOS = {
  fecha: '11/11/2026',
  mep: 1569.74,   // dólar MEP del resumen de Balanz de hoy
  efectivo: { ars: 10954.36, usd: 2.56, cable: 3.50 },
  // Tenencia según Balanz hoy (cantidad, precio en pesos por CEDEAR).
  // cantCosto = unidades de las que tengo el costo de compra (lotes del Excel). costoUsd = costo de esas unidades, en dólares MEP del día de cada compra.
  posiciones: [
    { ticker: 'GOOGL', nombre: 'Google',       cantidad: 164, cantCosto: 122, costoUsd: 674.32,  precioArs: 8470 },
    { ticker: 'NU',    nombre: 'Nu Holdings',  cantidad: 143, cantCosto: 143, costoUsd: 960.15,  precioArs: 10090, latam: true },
    { ticker: 'NVDA',  nombre: 'Nvidia',       cantidad: 109, cantCosto: 61,  costoUsd: 567.10,  precioArs: 12310 },
    { ticker: 'MELI',  nombre: 'MercadoLibre', cantidad: 64,  cantCosto: 64,  costoUsd: 1029.42, precioArs: 20850, latam: true },
    { ticker: 'AMZN',  nombre: 'Amazon',       cantidad: 203, cantCosto: 203, costoUsd: 329.72,  precioArs: 3075 },
    { ticker: 'META',  nombre: 'Meta',         cantidad: 25,  cantCosto: 25,  costoUsd: 710.72,  precioArs: 44600 },
    { ticker: 'MU',    nombre: 'Micron',       cantidad: 3,   cantCosto: 3,   costoUsd: 634.01,  precioArs: 274425 }
  ],
  compradoMesPico: { mes: 'octubre de 2026', usd: 2045 },
  balanzCerradas: {
    compraUsd: 2325.1, ventaUsd: 2323.6, resultadoUsd: -1.4,
    dividendosUsd: 3.5, cuponArs: 28889,
    detalle: [
      { ticker: 'MU',    pct: 28.1 }, { ticker: 'NVDA', pct: 10.6 }, { ticker: 'NOW', pct: 2.6 },
      { ticker: 'LOC5O', pct: -1.0 }, { ticker: 'BRKB', pct: -2.1 }, { ticker: 'NU', pct: -4.9 }, { ticker: 'XP', pct: -14.8 }
    ]
  },
  inviuCerradas: {
    compraArs: 2109109, ventaArs: 2476699, resultadoArs: 367591, dividendosUsd: 0.95, retiradoArs: 1655541,
    detalle: [
      { ticker: 'MSFT', pct: 32.0 }, { ticker: 'PBR', pct: 29.2 }, { ticker: 'SPY', pct: 14.8 },
      { ticker: 'NU', pct: 5.9 }, { ticker: 'MELI', pct: 5.4 }, { ticker: 'EWZ', pct: 5.2 }
    ]
  }
};

/* ====================== Utilidades ====================== */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function parseAmount(raw) {
  let s = String(raw || '').trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}
function num(n, dec) {
  return Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function usd(n) { return (n < 0 ? '-' : '') + 'US$ ' + num(n, Math.abs(n) >= 100 ? 0 : 2); }
function ars(n) { return (n < 0 ? '-' : '') + '$ ' + num(n, 0); }
function pct(n, dec = 1) { return (n > 0 ? '+' : n < 0 ? '-' : '') + num(n, dec) + '%'; }
function cls(n) { return n > 0 ? 'ingreso' : n < 0 ? 'gasto' : ''; }

/* ====================== Estado y Firestore ====================== */

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let uid = null;
let unsub = null;
let precios = {};   // { TICKER: precio en pesos por CEDEAR } — solo lo que cambiaste vos

onAuthStateChanged(auth, (user) => {
  if (unsub) { unsub(); unsub = null; }
  precios = {};
  if (!user) { uid = null; render(); return; }
  uid = user.uid;
  unsub = onSnapshot(doc(db, 'usuarios', uid, 'tk_config', 'precios'), (snap) => {
    const d = snap.exists() ? snap.data() : null;
    precios = d && d.base === DATOS.fecha ? (d.precios || {}) : {};
    render();
  }, (err) => console.error(err));
});

function guardarPrecios() {
  if (!uid) return;
  const hoy = new Date();
  const fecha = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
  setDoc(doc(db, 'usuarios', uid, 'tk_config', 'precios'), { precios, base: DATOS.fecha, actualizado: fecha })
    .catch((err) => console.error(err));
}

/* ====================== Cálculos ====================== */

function calcular() {
  const mep = DATOS.mep;
  const filas = DATOS.posiciones.map((p) => {
    const precioArs = precios[p.ticker] > 0 ? precios[p.ticker] : p.precioArs;
    const valorUsd = (precioArs * p.cantidad) / mep;
    const valorCosto = (precioArs * p.cantCosto) / mep;   // valor de las unidades con costo conocido
    return {
      ...p, precioArs, valorUsd, editado: precios[p.ticker] > 0,
      resultado: valorCosto - p.costoUsd,
      retorno: ((valorCosto - p.costoUsd) / p.costoUsd) * 100,
      costoUnit: p.costoUsd / p.cantCosto,
      sinCosto: p.cantidad - p.cantCosto
    };
  });
  const valorTotal = filas.reduce((s, f) => s + f.valorUsd, 0);
  const costoTotal = filas.reduce((s, f) => s + f.costoUsd, 0);
  const valorConCosto = filas.reduce((s, f) => s + (f.valorUsd * f.cantCosto) / f.cantidad, 0);
  filas.forEach((f) => { f.peso = (f.valorUsd / valorTotal) * 100; });
  const peso = (lista) => filas.filter((f) => lista.includes(f.ticker)).reduce((s, f) => s + f.peso, 0);
  return {
    filas, costoTotal, valorTotal,
    resultado: valorConCosto - costoTotal,
    retorno: ((valorConCosto - costoTotal) / costoTotal) * 100,
    top4: [...filas].sort((a, b) => b.peso - a.peso).slice(0, 4).reduce((s, f) => s + f.peso, 0),
    latam: peso(filas.filter((f) => f.latam).map((f) => f.ticker)),
    hayDif: filas.some((f) => f.sinCosto > 0)
  };
}

/* ====================== Render ====================== */

function render() {
  const root = $('inv-root');
  if (!root) return;
  const c = calcular();
  const ef = DATOS.efectivo;

  const resumen = `<div class="bal">
    <div class="lbl">Valor de tus CEDEARs hoy</div>
    <div class="amt">${usd(c.valorTotal)}</div>
    <div class="parts"><span>${ars(c.valorTotal * DATOS.mep)}</span>
      <span>Resultado ${usd(c.resultado)} (${pct(c.retorno)})</span></div>
  </div>`;

  const posiciones = c.filas.map((f) => `<div class="inv-pos">
    <div class="inv-head">
      <div><div class="t">${esc(f.ticker)} <span class="s">${esc(f.nombre)}</span></div>
        <div class="s">${f.cantidad} unidades · costo prom. ${usd(f.costoUnit)}</div></div>
      <div class="inv-peso">${num(f.peso, 0)}%</div>
    </div>
    <div class="inv-price">
      <input type="text" inputmode="decimal" data-t="${esc(f.ticker)}" value="${esc(String(f.precioArs).replace('.', ','))}" aria-label="Precio de ${esc(f.ticker)} en pesos">
      <div class="inv-res"><span>${usd(f.valorUsd)}</span>
        <span class="amt ${cls(f.resultado)}">${usd(f.resultado)} · ${pct(f.retorno)}</span></div>
    </div>
    ${f.sinCosto > 0 ? `<div class="s">${f.sinCosto} unidades sin costo cargado: el resultado cuenta solo las otras ${f.cantCosto}.</div>` : ''}
  </div>`).join('');

  const barras = [...c.filas].sort((a, b) => b.peso - a.peso).map((f) => `<div class="inv-bar">
    <span class="inv-bar-l">${esc(f.ticker)}</span>
    <span class="bar"><i style="width:${f.peso.toFixed(1)}%"></i></span>
    <span class="inv-bar-v">${num(f.peso, 0)}%</span></div>`).join('');

  const b = DATOS.balanzCerradas;
  const iv = DATOS.inviuCerradas;
  const det = (lista) => lista.map((d) => `<span class="inv-chip ${cls(d.pct)}">${esc(d.ticker)} ${pct(d.pct, 0)}</span>`).join('');

  root.innerHTML = `
    <div class="summary">${resumen}</div>

    <h2>Posiciones en Balanz</h2>
    <p class="muted">Precio en pesos de cada CEDEAR, el de tu tenencia de Balanz de hoy. Podés cambiarlo y se recalcula (dólar MEP ${num(DATOS.mep, 2)}).</p>
    <div class="list">${posiciones}</div>

    <h2>Cómo está repartido</h2>
    <div class="card">
      ${barras}
      <p class="muted" style="margin:6px 0 0">Reparto según el valor actual.</p>
    </div>

    <h2>Análisis breve</h2>
    <div class="card inv-analisis">
      <p>Tenés ${c.filas.length} posiciones, todas CEDEARs de empresas tecnológicas, en Balanz, más ${ars(ef.ars)} y US$ ${num(ef.usd + ef.cable, 2)} en efectivo. En Invíu hoy no tenés nada.</p>${c.hayDif ? '<p>Ojo: Google y Nvidia tienen más unidades en tu tenencia de hoy que en tus lotes, y Microsoft (32 unidades) figura en los lotes pero no en la tenencia. Mandame esos boletos y lo ajusto.</p>' : ''}
      <p>Las 4 más grandes suman ${num(c.top4, 0)}% de la cartera. MercadoLibre y Nu, las dos ligadas a Latinoamérica, suman ${num(c.latam, 0)}%.</p>
      <p>Compraste ${usd(DATOS.compradoMesPico.usd)} en ${esc(DATOS.compradoMesPico.mes)}: gran parte de lo invertido en los últimos 12 meses.</p>
      <p>Más del 95% lo compraste con pesos, así que tu resultado en dólares depende del MEP de cada compra.</p>
      <p class="muted">Esto describe cómo está armada la cartera. No es una recomendación de compra ni de venta.</p>
    </div>

    <h2>Ya cerradas</h2>
    <div class="card">
      <div><div class="t">Balanz</div>
        <div class="s">Compraste ${usd(b.compraUsd)} · vendiste ${usd(b.ventaUsd)}</div>
        <div class="amt ${cls(b.resultadoUsd)}">${usd(b.resultadoUsd)}, prácticamente en cero</div>
        <div class="inv-chips">${det(b.detalle)}</div>
        <div class="s">Dividendos ${usd(b.dividendosUsd)} · cupón ${ars(b.cuponArs)}</div></div>
      <div><div class="t">Invíu</div>
        <div class="s">Compraste ${ars(iv.compraArs)} · vendiste ${ars(iv.ventaArs)}</div>
        <div class="amt ${cls(iv.resultadoArs)}">${ars(iv.resultadoArs)} (${pct((iv.resultadoArs / iv.compraArs) * 100)}) en pesos</div>
        <div class="inv-chips">${det(iv.detalle)}</div>
        <div class="s">Retiraste ${ars(iv.retiradoArs)} a tu cuenta bancaria · dividendos ${usd(iv.dividendosUsd)}</div></div>
    </div>

    <p class="muted">Datos al ${esc(DATOS.fecha)}. Los costos en dólares usan el MEP del día de cada compra, por lo que son aproximados. Los resultados de Invíu están en pesos sin ajustar por inflación.</p>`;

  root.querySelectorAll('input[data-t]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const v = parseAmount(inp.value);
      const next = { ...precios };
      if (v > 0) next[inp.dataset.t] = v; else delete next[inp.dataset.t];
      precios = next;
      render();
      guardarPrecios();
    });
  });
}

render();
