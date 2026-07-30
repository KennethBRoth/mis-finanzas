import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  query, where, orderBy, onSnapshot, serverTimestamp,
  getDoc, setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
if (window.logDebug) window.logDebug('Firebase inicializado OK');

const DEFAULT_CATEGORIES = {
  gasto: ['Comida', 'Transporte', 'Servicios', 'Ocio', 'Salud', 'Compras', 'Otros'],
  ingreso: ['Sueldo', 'Negocio', 'Freelance', 'Otros'],
  inversion: ['Plazo fijo', 'Acciones/CEDEARs', 'Cripto', 'Fondo común', 'Otros']
};

const PAYMENT_METHODS = ['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Billetera virtual'];

const LABELS = { gasto: 'Gasto', ingreso: 'Ingreso', inversion: 'Inversión' };

let CATEGORIES = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
let currentType = 'gasto';
let currentCategory = CATEGORIES.gasto[0];
let currentPayment = PAYMENT_METHODS[0];
let allEntries = [];
let unsubscribeEntries = null;
let currentUid = null;

// ---------- Elementos ----------
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

const typeSelector = document.getElementById('type-selector');
const chipsContainer = document.getElementById('category-chips');
const paymentChipsContainer = document.getElementById('payment-chips');
const amountInput = document.getElementById('amount-input');
const noteInput = document.getElementById('note-input');
const addBtn = document.getElementById('add-btn');

const editCategoriesBtn = document.getElementById('edit-categories-btn');
const categoryEditor = document.getElementById('category-editor');
const catEditorList = document.getElementById('cat-editor-list');
const newCategoryInput = document.getElementById('new-category-input');
const addCategoryBtn = document.getElementById('add-category-btn');
const closeEditorBtn = document.getElementById('close-editor-btn');

const todayList = document.getElementById('today-list');
const todayDateEl = document.getElementById('today-date');
const historyList = document.getElementById('history-list');
const monthFilter = document.getElementById('month-filter');

const balanceAmountEl = document.getElementById('balance-amount');
const sumIngreso = document.getElementById('sum-ingreso');
const sumGasto = document.getElementById('sum-gasto');
const sumInversion = document.getElementById('sum-inversion');

// ---------- Auth ----------
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (window.logDebug) window.logDebug('Intentando login con ' + email);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    if (window.logDebug) window.logDebug('Login OK');
  } catch (err) {
    loginError.textContent = 'Error: ' + err.code;
    if (window.logDebug) window.logDebug('Login FALLÓ: ' + err.code + ' — ' + err.message);
  }
});

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (window.logDebug) window.logDebug('Estado de sesión: ' + (user ? 'logueado (' + user.email + ')' : 'sin sesión'));
  if (user) {
    currentUid = user.uid;
    loginScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    await loadCategories(user.uid);
    renderChips();
    renderPaymentChips();
    subscribeToEntries(user.uid);
  } else {
    currentUid = null;
    appScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    if (unsubscribeEntries) unsubscribeEntries();
  }
});

async function loadCategories(uid) {
  const ref = doc(db, 'usuarios', uid, 'config', 'categorias');
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    CATEGORIES = {
      gasto: data.gasto && data.gasto.length ? data.gasto : DEFAULT_CATEGORIES.gasto,
      ingreso: data.ingreso && data.ingreso.length ? data.ingreso : DEFAULT_CATEGORIES.ingreso,
      inversion: data.inversion && data.inversion.length ? data.inversion : DEFAULT_CATEGORIES.inversion
    };
  } else {
    CATEGORIES = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    await setDoc(ref, CATEGORIES);
  }
  currentCategory = CATEGORIES[currentType][0];
}

async function saveCategories() {
  if (!currentUid) return;
  const ref = doc(db, 'usuarios', currentUid, 'config', 'categorias');
  await setDoc(ref, CATEGORIES);
}

// ---------- Selector de tipo ----------
typeSelector.addEventListener('click', (e) => {
  const btn = e.target.closest('.type-btn');
  if (!btn) return;
  currentType = btn.dataset.type;
  [...typeSelector.children].forEach(b => b.classList.toggle('active', b === btn));
  currentCategory = CATEGORIES[currentType][0];
  renderChips();
  if (!categoryEditor.classList.contains('hidden')) renderCategoryEditor();
});

function renderChips() {
  chipsContainer.innerHTML = '';
  CATEGORIES[currentType].forEach((cat) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (cat === currentCategory ? ' active' : '');
    chip.textContent = cat;
    chip.addEventListener('click', () => {
      currentCategory = cat;
      [...chipsContainer.children].forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
    chipsContainer.appendChild(chip);
  });
}
renderChips();

// ---------- Forma de pago ----------
function renderPaymentChips() {
  paymentChipsContainer.innerHTML = '';
  PAYMENT_METHODS.forEach((method) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (method === currentPayment ? ' active' : '');
    chip.textContent = method;
    chip.addEventListener('click', () => {
      currentPayment = method;
      [...paymentChipsContainer.children].forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
    paymentChipsContainer.appendChild(chip);
  });
}
renderPaymentChips();

// ---------- Editor de categorías ----------
editCategoriesBtn.addEventListener('click', () => {
  categoryEditor.classList.toggle('hidden');
  renderCategoryEditor();
});

closeEditorBtn.addEventListener('click', () => {
  categoryEditor.classList.add('hidden');
});

function renderCategoryEditor() {
  catEditorList.innerHTML = '';
  CATEGORIES[currentType].forEach((cat) => {
    const item = document.createElement('div');
    item.className = 'cat-editor-chip';
    item.innerHTML = `<span>${escapeHtml(cat)}</span><button title="Eliminar">×</button>`;
    item.querySelector('button').addEventListener('click', () => removeCategory(cat));
    catEditorList.appendChild(item);
  });
}

addCategoryBtn.addEventListener('click', addCategoryFromInput);
newCategoryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addCategoryFromInput(); }
});

async function addCategoryFromInput() {
  const name = newCategoryInput.value.trim();
  if (!name) return;
  if (CATEGORIES[currentType].some(c => c.toLowerCase() === name.toLowerCase())) {
    newCategoryInput.value = '';
    return;
  }
  CATEGORIES[currentType].push(name);
  newCategoryInput.value = '';
  await saveCategories();
  renderCategoryEditor();
  renderChips();
}

async function removeCategory(name) {
  if (CATEGORIES[currentType].length <= 1) return; // siempre dejar al menos una
  CATEGORIES[currentType] = CATEGORIES[currentType].filter(c => c !== name);
  if (currentCategory === name) currentCategory = CATEGORIES[currentType][0];
  await saveCategories();
  renderCategoryEditor();
  renderChips();
}

// ---------- Agregar movimiento ----------
addBtn.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return;
  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) {
    amountInput.focus();
    return;
  }
  addBtn.disabled = true;
  try {
    const now = new Date();
    await addDoc(collection(db, 'usuarios', user.uid, 'movimientos'), {
      type: currentType,
      category: currentCategory,
      paymentMethod: currentPayment,
      amount: amount,
      note: noteInput.value.trim(),
      date: now.toISOString(),
      createdAt: serverTimestamp()
    });
    amountInput.value = '';
    noteInput.value = '';
    amountInput.focus();
  } catch (err) {
    alert('No se pudo guardar el movimiento. Probá de nuevo.');
  } finally {
    addBtn.disabled = false;
  }
});

// ---------- Datos en tiempo real ----------
function subscribeToEntries(uid) {
  const q = query(collection(db, 'usuarios', uid, 'movimientos'), orderBy('date', 'desc'));
  unsubscribeEntries = onSnapshot(q, (snap) => {
    allEntries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  });
}

async function deleteEntry(id) {
  const user = auth.currentUser;
  if (!user) return;
  await deleteDoc(doc(db, 'usuarios', user.uid, 'movimientos', id));
}

// ---------- Render ----------
function fmt(n) {
  return '$ ' + Math.round(n).toLocaleString('es-AR');
}

function entryRow(entry) {
  const row = document.createElement('div');
  row.className = 'entry-row';
  row.innerHTML = `
    <span class="entry-cat">${entry.category}</span>
    ${entry.paymentMethod ? `<span class="entry-payment">${escapeHtml(entry.paymentMethod)}</span>` : ''}
    ${entry.note ? `<span class="entry-note">${escapeHtml(entry.note)}</span>` : ''}
    <span class="entry-fill"></span>
    <span class="entry-amount ${entry.type}">${entry.type === 'gasto' ? '-' : '+'}${fmt(entry.amount)}</span>
    <button class="entry-del" title="Eliminar" data-id="${entry.id}">×</button>
  `;
  row.querySelector('.entry-del').addEventListener('click', () => deleteEntry(entry.id));
  return row;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderAll() {
  const now = new Date();
  const todayKey = now.toDateString();

  // Hoy
  todayDateEl.textContent = now.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  const todays = allEntries.filter(e => new Date(e.date).toDateString() === todayKey);
  todayList.innerHTML = '';
  if (todays.length === 0) {
    todayList.innerHTML = '<p class="empty-state">Todavía no cargaste nada hoy. Arriba tenés el primer renglón.</p>';
  } else {
    todays.forEach(e => todayList.appendChild(entryRow(e)));
  }

  // Meses disponibles
  const monthKeys = new Set(allEntries.map(e => e.date.slice(0, 7)));
  const currentMonthKey = now.toISOString().slice(0, 7);
  monthKeys.add(currentMonthKey);
  const sortedMonths = [...monthKeys].sort().reverse();

  const prevSelection = monthFilter.value;
  monthFilter.innerHTML = '';
  sortedMonths.forEach(mk => {
    const opt = document.createElement('option');
    opt.value = mk;
    const [y, m] = mk.split('-');
    opt.textContent = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    monthFilter.appendChild(opt);
  });
  monthFilter.value = sortedMonths.includes(prevSelection) ? prevSelection : currentMonthKey;

  renderHistory();
  renderSummary();
}

function renderHistory() {
  const monthKey = monthFilter.value;
  const entries = allEntries.filter(e => e.date.slice(0, 7) === monthKey);
  historyList.innerHTML = '';
  if (entries.length === 0) {
    historyList.innerHTML = '<p class="empty-state">Sin movimientos este mes.</p>';
    return;
  }
  let lastDay = null;
  entries.forEach(e => {
    const day = new Date(e.date).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
    if (day !== lastDay) {
      const label = document.createElement('div');
      label.className = 'day-group-label';
      label.textContent = day;
      historyList.appendChild(label);
      lastDay = day;
    }
    historyList.appendChild(entryRow(e));
  });
}

function renderSummary() {
  const monthKey = monthFilter.value;
  const entries = allEntries.filter(e => e.date.slice(0, 7) === monthKey);
  const totals = { gasto: 0, ingreso: 0, inversion: 0 };
  entries.forEach(e => { totals[e.type] += e.amount; });

  sumIngreso.textContent = fmt(totals.ingreso);
  sumGasto.textContent = fmt(totals.gasto);
  sumInversion.textContent = fmt(totals.inversion);

  const balance = totals.ingreso - totals.gasto - totals.inversion;
  balanceAmountEl.textContent = fmt(balance);
}

monthFilter.addEventListener('change', () => {
  renderHistory();
  renderSummary();
});
