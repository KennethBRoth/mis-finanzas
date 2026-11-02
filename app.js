// Ticket v2 — finanzas personales
// Datos en colecciones nuevas (prefijo tk_) dentro de usuarios/{uid}/…, así no se mezclan con la versión anterior.
// Las reglas de Firestore existentes (usuarios/{userId}/{document=**}) ya las cubren.

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc,
  writeBatch, increment, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ====================== Constantes y estado ====================== */

const DEFAULTS = {
  categorias: {
    gasto: ['Comida', 'Transporte', 'Servicios', 'Ocio', 'Salud', 'Compras', 'Otros'],
    ingreso: ['Sueldo', 'Negocio', 'Freelance', 'Otros'],
    inversion: ['Plazo fijo', 'Acciones/CEDEARs', 'Cripto', 'Fondo común', 'Otros']
  },
  pagos: ['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Billetera virtual']
};
const SIGN = { ARS: '$', USD: 'US$' };
const LABEL = { gasto: 'Gasto', ingreso: 'Ingreso', inversion: 'Inversión' };

let uid = null;
let unsubs = [];

let config = clone(DEFAULTS);
config.presupuestos = {};
let movs = [];       // movimientos
let recs = [];       // recurrentes
let debts = [];      // deudas

// formulario "Cargar"
const form = { type: 'gasto', dir: 'aporte', cur: 'ARS', cat: DEFAULTS.categorias.gasto[0], pay: DEFAULTS.pagos[0] };
// formulario recurrente
const recForm = { type: 'gasto', cur: 'ARS', cat: DEFAULTS.categorias.gasto[0] };
// formulario deuda
const debtForm = { type: 'debo', cur: 'ARS' };

let viewMonth = monthKey(new Date());
let catEditType = 'gasto';
let generating = false;

/* ====================== Utilidades ====================== */

const $ = (id) => document.getElementById(id);
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function pad(n) { return String(n).padStart(2, "0"); }

// Fechas SIEMPRE en hora local (nada de toISOString, que usa UTC y corre el día/mes de noche)
function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
function shiftMonth(mk, delta) {
  const [y, m] = mk.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
function monthLabel(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}
function dayLabel(dk) {
  const [y, m, d] = dk.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Acepta "1500", "1.500", "1.500,50", "1500.5"
function parseAmount(raw) {
  let s = String(raw || '').trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

function fmt(n, cur) {
  const dec = Math.abs(n) % 1 === 0 ? 0 : 2;
  const abs = Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return (n < 0 ? '-' : '') + (SIGN[cur] || '$') + ' ' + abs;
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}
function fail(err) {
  console.error(err);
  toast('No se pudo guardar. Revisá tu conexión.');
}

const col = (name) => collection(db, 'usuarios', uid, name);
const ref = (name, id) => doc(db, 'usuarios', uid, name, id);

/* ====================== Login ====================== */

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  try {
    await signInWithEmailAndPassword(auth, $('login-email').value.trim(), $('login-pass').value);
  } catch (err) {
    const msgs = {
      'auth/invalid-credential': 'Email o contraseña incorrectos.',
      'auth/invalid-email': 'El email no es válido.',
      'auth/too-many-requests': 'Demasiados intentos. Esperá un rato.',
      'auth/network-request-failed': 'Sin conexión.'
    };
    $('login-error').textContent = msgs[err.code] || ('Error: ' + err.code);
  }
});

$('logout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  unsubs.forEach((u) => u());
  unsubs = [];
  if (!user) {
    uid = null;
    movs = []; recs = []; debts = [];
    $('app').classList.add('hidden');
    $('login').classList.remove('hidden');
    return;
  }
  uid = user.uid;
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  subscribe();
});

function subscribe() {
  unsubs.push(onSnapshot(ref('tk_config', 'ajustes'), (snap) => {
    const d = snap.exists() ? snap.data() : {};
    config = {
      categorias: {
        gasto: d.categorias?.gasto?.length ? d.categorias.gasto : DEFAULTS.categorias.gasto,
        ingreso: d.categorias?.ingreso?.length ? d.categorias.ingreso : DEFAULTS.categorias.ingreso,
        inversion: d.categorias?.inversion?.length ? d.categorias.inversion : DEFAULTS.categorias.inversion
      },
      pagos: d.pagos?.length ? d.pagos : DEFAULTS.pagos,
      presupuestos: d.presupuestos || {}
    };
    fixSelections();
    renderAll();
  }, fail));

  unsubs.push(onSnapshot(col('tk_movimientos'), (snap) => {
    movs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    movs.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') ||
      ((b.createdAt?.toMillis?.() ?? Infinity) - (a.createdAt?.toMillis?.() ?? Infinity)));
    renderAll();
  }, fail));

  unsubs.push(onSnapshot(col('tk_recurrentes'), (snap) => {
    recs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.dia - b.dia);
    renderRecs();
    generateRecurring();
  }, fail));

  unsubs.push(onSnapshot(col('tk_deudas'), (snap) => {
    debts = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? Infinity) - (a.createdAt?.toMillis?.() ?? Infinity));
    renderDebts();
  }, fail));
}

// Si se borró la categoría o forma de pago elegida, volver a una válida
function fixSelections() {
  if (!config.categorias[form.type].includes(form.cat)) form.cat = config.categorias[form.type][0];
  if (!config.pagos.includes(form.pay)) form.pay = config.pagos[0];
  if (!config.categorias[recForm.type].includes(recForm.cat)) recForm.cat = config.categorias[recForm.type][0];
}

async function saveConfig() {
  await setDoc(ref('tk_config', 'ajustes'), {
    categorias: config.categorias,
    pagos: config.pagos,
    presupuestos: config.presupuestos
  });
}

/* ====================== Tabs ====================== */

$('tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  document.querySelectorAll('.tab').forEach((s) => s.classList.add('hidden'));
  $('tab-' + b.dataset.tab).classList.remove('hidden');
  [...$('tabbar').children].forEach((x) => x.classList.toggle('on', x === b));
  window.scrollTo(0, 0);
});

function bindSeg(id, attr, onPick) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-' + attr + ']');
    if (!b) return;
    [...$(id).children].forEach((x) => x.classList.toggle('on', x === b));
    onPick(b.dataset[attr]);
  });
}

/* ====================== Cargar movimiento ====================== */

bindSeg('type-seg', 'type', (t) => {
  form.type = t;
  form.cat = config.categorias[t][0];
  $('dir-seg').classList.toggle('hidden', t !== 'inversion');
  form.dir = 'aporte';
  [...$('dir-seg').children].forEach((x) => x.classList.toggle('on', x.dataset.dir === 'aporte'));
  renderChips();
});
bindSeg('dir-seg', 'dir', (d) => { form.dir = d; });
bindSeg('cur-seg', 'cur', (c) => { form.cur = c; });
$('pay').addEventListener('change', () => { form.pay = $('pay').value; });

$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const monto = parseAmount($('amount').value);
  if (!(monto > 0)) { $('amount').focus(); return; }
  const now = new Date();
  const data = {
    tipo: form.type,
    categoria: form.cat,
    pago: form.pay,
    monto,
    moneda: form.cur,
    direccion: form.type === 'inversion' ? form.dir : null,
    nota: $('note').value.trim(),
    fecha: dateKey(now),
    mes: monthKey(now),
    createdAt: serverTimestamp()
  };
  // Sin await: la lista se actualiza al instante y la app queda lista para el próximo
  setDoc(doc(col('tk_movimientos')), data).catch(fail);
  $('amount').value = '';
  $('note').value = '';
  $('amount').focus();
  toast('Guardado ✓');
});

function renderChips() {
  const box = $('cat-chips');
  box.innerHTML = '';
  config.categorias[form.type].forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (c === form.cat ? ' on' : '');
    b.textContent = c;
    b.addEventListener('click', () => { form.cat = c; renderChips(); });
    box.appendChild(b);
  });
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'link';
  edit.textContent = 'Editar categorías';
  edit.addEventListener('click', openCatEditor);
  box.appendChild(edit);
}

// Atajo desde "Cargar": abre Más → Categorías con el tipo que está elegido
function openCatEditor() {
  catEditType = form.type;
  [...$('catedit-seg').children].forEach((x) => x.classList.toggle('on', x.dataset.type === catEditType));
  renderCatEditor();
  document.querySelector('#tabbar [data-tab="mas"]').click();
  $('catedit-seg').scrollIntoView();
}

function renderPay() {
  const sel = $('pay');
  sel.innerHTML = config.pagos.map((p) => `<option>${esc(p)}</option>`).join('');
  sel.value = form.pay;
}

/* ====================== Cálculos ====================== */

function invNet(m) { return m.direccion === 'retiro' ? -m.monto : m.monto; }

function totals(list, cur) {
  const t = { ingreso: 0, gasto: 0, inversion: 0 };
  list.forEach((m) => {
    if ((m.moneda || 'ARS') !== cur) return;
    if (m.tipo === 'inversion') t.inversion += invNet(m);
    else if (m.tipo in t) t[m.tipo] += m.monto;
  });
  t.balance = t.ingreso - t.gasto - t.inversion;
  return t;
}

function summaryHtml(list, title, compact) {
  const hasUsd = movs.some((m) => m.moneda === 'USD');
  const curs = hasUsd ? ['ARS', 'USD'] : ['ARS'];
  return curs.map((cur) => {
    const t = totals(list, cur);
    return `<div class="bal${compact ? ' compact' : ''}">
      <div class="lbl">${esc(title)} · ${cur}</div>
      <div class="amt">${fmt(t.balance, cur)}</div>
      <div class="parts">
        <span><i class="dot ingreso"></i>Ingresos <b>${fmt(t.ingreso, cur)}</b></span>
        <span><i class="dot gasto"></i>Gastos <b>${fmt(t.gasto, cur)}</b></span>
        <span><i class="dot inversion"></i>Inversión <b>${fmt(t.inversion, cur)}</b></span>
      </div>
    </div>`;
  }).join('');
}

/* ====================== Render: lista de movimientos ====================== */

function entryHtml(m) {
  let sign = '+';
  if (m.tipo === 'gasto') sign = '-';
  else if (m.tipo === 'inversion') sign = m.direccion === 'retiro' ? '+' : '-';
  const dir = m.tipo === 'inversion' && m.direccion === 'retiro' ? ' · retiro' : '';
  const sub = [m.pago, m.nota].filter(Boolean).map(esc).join(' · ');
  return `<div class="item">
    <div class="main">
      <div class="t">${esc(m.categoria)}${dir}</div>
      ${sub ? `<div class="s">${sub}</div>` : ''}
    </div>
    <div class="amt ${esc(m.tipo)}">${sign}${fmt(m.monto, m.moneda || 'ARS')}</div>
    <button class="x" data-del="${esc(m.id)}" aria-label="Eliminar">×</button>
  </div>`;
}

function bindDelete(container) {
  container.querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', () => {
      if (confirm('¿Eliminar este movimiento?')) deleteDoc(ref('tk_movimientos', b.dataset.del)).catch(fail);
    });
  });
}

function renderHome() {
  const now = new Date();
  const mk = monthKey(now);
  $('home-summary').innerHTML = summaryHtml(movs.filter((m) => m.mes === mk), 'Este mes', true);

  // alertas de presupuesto (solo gastos en ARS del mes actual)
  const alerts = Object.entries(config.presupuestos).filter(([, lim]) => lim > 0).map(([cat, lim]) => {
    const spent = movs.filter((m) => m.tipo === 'gasto' && m.categoria === cat && m.mes === mk && (m.moneda || 'ARS') === 'ARS')
      .reduce((s, m) => s + m.monto, 0);
    return spent > lim ? `<div class="alert">Te pasaste en ${esc(cat)}: ${fmt(spent, 'ARS')} de ${fmt(lim, 'ARS')}</div>` : '';
  }).join('');
  $('home-alerts').innerHTML = alerts;

  const today = dateKey(now);
  const list = movs.filter((m) => m.fecha === today);
  $('today-list').innerHTML = list.length ? list.map(entryHtml).join('') : '<p class="empty">Todavía no cargaste nada hoy.</p>';
  bindDelete($('today-list'));
}

function renderHistory() {
  $('month-label').textContent = monthLabel(viewMonth);
  $('next-month').disabled = viewMonth >= monthKey(new Date());
  const list = movs.filter((m) => m.mes === viewMonth);
  $('hist-summary').innerHTML = summaryHtml(list, 'Balance');

  // Total invertido acumulado (todos los meses)
  const inv = { ARS: 0, USD: 0 };
  movs.forEach((m) => { if (m.tipo === 'inversion') inv[m.moneda || 'ARS'] += invNet(m); });
  $('invested-total').innerHTML = 'Invertido en total: <b>' + fmt(inv.ARS, 'ARS') + '</b>' +
    (inv.USD ? ' · <b>' + fmt(inv.USD, 'USD') + '</b>' : '');

  let html = '';
  let last = null;
  list.forEach((m) => {
    if (m.fecha !== last) { html += `<div class="day">${esc(dayLabel(m.fecha))}</div>`; last = m.fecha; }
    html += entryHtml(m);
  });
  $('hist-list').innerHTML = html || '<p class="empty">Sin movimientos este mes.</p>';
  bindDelete($('hist-list'));
}

$('prev-month').addEventListener('click', () => { viewMonth = shiftMonth(viewMonth, -1); renderHistory(); });
$('next-month').addEventListener('click', () => {
  if (viewMonth < monthKey(new Date())) { viewMonth = shiftMonth(viewMonth, 1); renderHistory(); }
});

/* ====================== Presupuestos ====================== */

function renderBudgets() {
  const mk = monthKey(new Date());
  const box = $('budget-list');
  box.innerHTML = config.categorias.gasto.map((cat) => {
    const spent = movs.filter((m) => m.tipo === 'gasto' && m.categoria === cat && m.mes === mk && (m.moneda || 'ARS') === 'ARS')
      .reduce((s, m) => s + m.monto, 0);
    const lim = config.presupuestos[cat];
    const over = lim > 0 && spent > lim;
    return `<div class="budget-row${over ? ' over' : ''}">
      <div><div class="t">${esc(cat)}</div>
        <div class="s">${lim > 0 ? fmt(spent, 'ARS') + ' de ' + fmt(lim, 'ARS') : fmt(spent, 'ARS') + ' este mes'}</div></div>
      <input type="text" inputmode="decimal" placeholder="Sin límite" value="${lim > 0 ? lim : ''}" data-cat="${esc(cat)}">
    </div>`;
  }).join('');
  box.querySelectorAll('input[data-cat]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const v = parseAmount(inp.value);
      const next = { ...config.presupuestos };
      if (v > 0) next[inp.dataset.cat] = v; else delete next[inp.dataset.cat];
      config.presupuestos = next;
      saveConfig().catch(fail);
    });
  });
}

/* ====================== Recurrentes ====================== */

$('toggle-rec-form').addEventListener('click', () => $('rec-form').classList.toggle('hidden'));
bindSeg('rec-type-seg', 'type', (t) => { recForm.type = t; recForm.cat = config.categorias[t][0]; renderRecChips(); });
bindSeg('rec-cur-seg', 'cur', (c) => { recForm.cur = c; });

function renderRecChips() {
  const box = $('rec-cat-chips');
  box.innerHTML = '';
  config.categorias[recForm.type].forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (c === recForm.cat ? ' on' : '');
    b.textContent = c;
    b.addEventListener('click', () => { recForm.cat = c; renderRecChips(); });
    box.appendChild(b);
  });
}

$('rec-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const monto = parseAmount($('rec-amount').value);
  const dia = parseInt($('rec-day').value, 10);
  const nombre = $('rec-name').value.trim();
  if (!(monto > 0) || !(dia >= 1 && dia <= 28) || !nombre) { toast('Completá nombre, monto y día (1–28)'); return; }
  setDoc(doc(col('tk_recurrentes')), {
    tipo: recForm.type, categoria: recForm.cat, nombre, monto, moneda: recForm.cur, dia,
    desde: monthKey(new Date()), ultimoMes: null, createdAt: serverTimestamp()
  }).catch(fail);
  $('rec-name').value = ''; $('rec-amount').value = ''; $('rec-day').value = 1;
  $('rec-form').classList.add('hidden');
});

function renderRecs() {
  const box = $('rec-list');
  if (!recs.length) { box.innerHTML = '<p class="empty">No tenés recurrentes.</p>'; return; }
  box.innerHTML = recs.map((r) => `<div class="item">
    <div class="main"><div class="t">${esc(r.nombre)}</div>
      <div class="s">${LABEL[r.tipo]} · ${esc(r.categoria)} · día ${r.dia}</div></div>
    <div class="amt ${esc(r.tipo)}">${fmt(r.monto, r.moneda)}</div>
    <button class="x" data-rdel="${esc(r.id)}" aria-label="Eliminar">×</button>
  </div>`).join('');
  box.querySelectorAll('[data-rdel]').forEach((b) => b.addEventListener('click', () => {
    if (confirm('¿Eliminar este recurrente? Los movimientos ya cargados se mantienen.')) {
      deleteDoc(ref('tk_recurrentes', b.dataset.rdel)).catch(fail);
    }
  }));
}

// Genera los movimientos recurrentes que correspondan. Es seguro ante repeticiones:
// el id del movimiento es fijo (rec_<id>_<mes>) y el mes generado se guarda en el mismo lote.
async function generateRecurring() {
  if (generating || !uid) return;
  generating = true;
  try {
    const now = new Date();
    const cur = monthKey(now);
    const today = now.getDate();
    for (const r of recs) {
      let m = r.ultimoMes ? shiftMonth(r.ultimoMes, 1) : r.desde;
      while (m <= cur) {
        if (m === cur && today < r.dia) break;
        const fecha = m + '-' + pad(r.dia);
        const batch = writeBatch(db);
        batch.set(ref('tk_movimientos', 'rec_' + r.id + '_' + m), {
          tipo: r.tipo, categoria: r.categoria, pago: 'Recurrente', monto: r.monto, moneda: r.moneda || 'ARS',
          direccion: null, nota: r.nombre, fecha, mes: m, createdAt: serverTimestamp()
        });
        batch.update(ref('tk_recurrentes', r.id), { ultimoMes: m });
        await batch.commit();
        r.ultimoMes = m;
        m = shiftMonth(m, 1);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    generating = false;
  }
}

/* ====================== Deudas ====================== */

$('toggle-debt-form').addEventListener('click', () => $('debt-form').classList.toggle('hidden'));
bindSeg('debt-type-seg', 'dt', (t) => { debtForm.type = t; });
bindSeg('debt-cur-seg', 'cur', (c) => { debtForm.cur = c; });

$('debt-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const total = parseAmount($('debt-amount').value);
  const nombre = $('debt-name').value.trim();
  if (!(total > 0) || !nombre) { toast('Completá nombre y monto'); return; }
  setDoc(doc(col('tk_deudas')), {
    nombre, tipo: debtForm.type, moneda: debtForm.cur, total, pagado: 0, createdAt: serverTimestamp()
  }).catch(fail);
  $('debt-name').value = ''; $('debt-amount').value = '';
  $('debt-form').classList.add('hidden');
});

function renderDebts() {
  const box = $('debt-list');
  if (!debts.length) { box.innerHTML = '<p class="empty">No tenés deudas cargadas.</p>'; return; }
  box.innerHTML = debts.map((d) => {
    const debo = d.tipo === 'debo';
    const saldo = d.total - d.pagado;
    const done = saldo <= 0;
    const pct = Math.min(100, Math.round((d.pagado / d.total) * 100));
    const verbo = debo ? 'Pagar' : 'Cobrar';
    return `<div class="debt" data-id="${esc(d.id)}">
      <div class="top">
        <span class="name">${esc(d.nombre)}<span class="tag">${debo ? 'Debo' : 'Me deben'}</span></span>
        <span class="${done ? 'bal-done' : debo ? 'bal-owe' : 'bal-owed'}">${done ? (debo ? 'Saldada' : 'Cobrada') : fmt(saldo, d.moneda)}</span>
      </div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="detail">${fmt(d.pagado, d.moneda)} ${debo ? 'pagado' : 'cobrado'} de ${fmt(d.total, d.moneda)}</div>
      ${done ? '' : `
      <div class="pay-row">
        <input type="text" inputmode="decimal" placeholder="Monto en ${d.moneda}" class="pay-amt">
        <button class="btn small primary pay-btn">${verbo}</button>
      </div>
      <button class="link other-toggle">¿${debo ? 'Pagaste' : 'Cobraste'} en otra moneda?</button>
      <div class="other hidden">
        <select class="other-cur">
          <option value="ARS"${d.moneda === 'ARS' ? ' disabled' : ''}>ARS</option>
          <option value="USD"${d.moneda === 'USD' ? ' disabled' : ''}>USD</option>
        </select>
        <input type="text" inputmode="decimal" placeholder="Monto real" class="other-amt">
      </div>`}
      <button class="link danger del-debt">Eliminar deuda</button>
    </div>`;
  }).join('');

  box.querySelectorAll('.debt').forEach((card) => {
    const d = debts.find((x) => x.id === card.dataset.id);
    card.querySelector('.del-debt').addEventListener('click', () => {
      if (confirm('¿Eliminar esta deuda? Los movimientos ya registrados se mantienen.')) {
        deleteDoc(ref('tk_deudas', d.id)).catch(fail);
      }
    });
    const payBtn = card.querySelector('.pay-btn');
    if (!payBtn) return;
    const other = card.querySelector('.other');
    card.querySelector('.other-toggle').addEventListener('click', () => other.classList.toggle('hidden'));
    payBtn.addEventListener('click', () => {
      const monto = parseAmount(card.querySelector('.pay-amt').value);
      if (!(monto > 0)) { card.querySelector('.pay-amt').focus(); return; }
      let realCur = d.moneda;
      let real = monto;
      if (!other.classList.contains('hidden')) {
        const o = parseAmount(card.querySelector('.other-amt').value);
        if (o > 0) { real = o; realCur = card.querySelector('.other-cur').value; }
      }
      payDebt(d, monto, real, realCur);
    });
  });
}

// Actualiza la deuda y registra el movimiento en un solo lote (o se hacen las dos cosas, o ninguna)
function payDebt(d, monto, real, realCur) {
  const debo = d.tipo === 'debo';
  const now = new Date();
  const batch = writeBatch(db);
  batch.update(ref('tk_deudas', d.id), { pagado: increment(monto) });
  batch.set(doc(col('tk_movimientos')), {
    tipo: debo ? 'gasto' : 'ingreso',
    categoria: debo ? 'Pago de deuda' : 'Cobro de deuda',
    pago: 'Deuda',
    monto: real, moneda: realCur, direccion: null,
    nota: (debo ? 'Pago a ' : 'Cobro de ') + d.nombre + (realCur !== d.moneda ? ` (deuda en ${d.moneda})` : ''),
    fecha: dateKey(now), mes: monthKey(now), createdAt: serverTimestamp()
  });
  batch.commit().then(() => toast(debo ? 'Pago registrado ✓' : 'Cobro registrado ✓')).catch(fail);
}

/* ====================== Editor de categorías y formas de pago ====================== */

bindSeg('catedit-seg', 'type', (t) => { catEditType = t; renderCatEditor(); });

function renderCatEditor() {
  const list = config.categorias[catEditType];
  $('catedit-list').innerHTML = list.map((c, i) => `<div class="item">
    <div class="main"><div class="t">${esc(c)}</div></div>
    <button class="x" data-i="${i}" aria-label="Eliminar">×</button></div>`).join('');
  $('catedit-list').querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
    if (list.length <= 1) { toast('Tiene que quedar al menos una'); return; }
    config.categorias[catEditType] = list.filter((_, i) => i !== Number(b.dataset.i));
    fixSelections();
    saveConfig().catch(fail);
    renderAll();
  }));
}

$('catedit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('catedit-input').value.trim();
  if (!v) return;
  if (!config.categorias[catEditType].includes(v)) {
    config.categorias[catEditType] = [...config.categorias[catEditType], v];
    saveConfig().catch(fail);
    renderAll();
  }
  $('catedit-input').value = '';
});

function renderPayEditor() {
  $('payedit-list').innerHTML = config.pagos.map((p, i) => `<div class="item">
    <div class="main"><div class="t">${esc(p)}</div></div>
    <button class="x" data-i="${i}" aria-label="Eliminar">×</button></div>`).join('');
  $('payedit-list').querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
    if (config.pagos.length <= 1) { toast('Tiene que quedar al menos una'); return; }
    config.pagos = config.pagos.filter((_, i) => i !== Number(b.dataset.i));
    fixSelections();
    saveConfig().catch(fail);
    renderAll();
  }));
}

$('payedit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('payedit-input').value.trim();
  if (!v) return;
  if (!config.pagos.includes(v)) {
    config.pagos = [...config.pagos, v];
    saveConfig().catch(fail);
    renderAll();
  }
  $('payedit-input').value = '';
});

/* ====================== Render general ====================== */

function renderAll() {
  renderChips();
  renderPay();
  renderRecChips();
  renderHome();
  renderHistory();
  renderBudgets();
  renderCatEditor();
  renderPayEditor();
}

renderAll();
renderRecs();
renderDebts();
