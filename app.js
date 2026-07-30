import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  query, orderBy, onSnapshot, serverTimestamp,
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

const DEFAULT_PAYMENT_METHODS = ['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Billetera virtual'];
let PAYMENT_METHODS = [...DEFAULT_PAYMENT_METHODS];
const CURRENCY_SIGN = { ARS: '$', USD: 'US$' };
const LABELS = { gasto: 'Gasto', ingreso: 'Ingreso', inversion: 'Inversión' };

let CATEGORIES = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
let currentType = 'gasto';
let currentCategory = CATEGORIES.gasto[0];
let currentPayment = PAYMENT_METHODS[0];
let currentCurrency = 'ARS';

let recurringType = 'gasto';
let recurringCategory = CATEGORIES.gasto[0];
let recurringCurrency = 'ARS';

let allEntries = [];
let recurringDefs = [];
let budgets = {};
let unsubscribeEntries = null;
let unsubscribeRecurring = null;
let currentUid = null;
let viewMode = 'month';
let rangeFrom = null;
let rangeTo = null;

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const loginTitle = document.getElementById('login-title');
const loginSubtitle = document.getElementById('login-subtitle');
const loginPasswordConfirm = document.getElementById('login-password-confirm');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const toggleSignupBtn = document.getElementById('toggle-signup-btn');

const typeSelector = document.getElementById('type-selector');
const chipsContainer = document.getElementById('category-chips');
const paymentChipsContainer = document.getElementById('payment-chips');
const amountInput = document.getElementById('amount-input');
const noteInput = document.getElementById('note-input');
const addBtn = document.getElementById('add-btn');
const currencyToggle = document.getElementById('currency-toggle');
const currencySignLabel = document.getElementById('currency-sign-label');

const editCategoriesBtn = document.getElementById('edit-categories-btn');
const categoryEditor = document.getElementById('category-editor');
const catEditorList = document.getElementById('cat-editor-list');
const newCategoryInput = document.getElementById('new-category-input');
const addCategoryBtn = document.getElementById('add-category-btn');
const closeEditorBtn = document.getElementById('close-editor-btn');

const editPaymentsBtn = document.getElementById('edit-payments-btn');
const paymentEditor = document.getElementById('payment-editor');
const paymentEditorList = document.getElementById('payment-editor-list');
const newPaymentInput = document.getElementById('new-payment-input');
const addPaymentBtn = document.getElementById('add-payment-btn');
const closePaymentEditorBtn = document.getElementById('close-payment-editor-btn');

const todayList = document.getElementById('today-list');
const todayDateEl = document.getElementById('today-date');
const historyList = document.getElementById('history-list');
const monthFilter = document.getElementById('month-filter');
const balancePeriodLabel = document.getElementById('balance-period-label');
const balanceCardsEl = document.getElementById('balance-cards');
const budgetAlertsEl = document.getElementById('budget-alerts');

const toggleRangeBtn = document.getElementById('toggle-range-btn');
const rangePicker = document.getElementById('range-picker');
const rangeFromInput = document.getElementById('range-from');
const rangeToInput = document.getElementById('range-to');
const applyRangeBtn = document.getElementById('apply-range-btn');
const cancelRangeBtn = document.getElementById('cancel-range-btn');

const toggleRecurringBtn = document.getElementById('toggle-recurring-btn');
const recurringForm = document.getElementById('recurring-form');
const recurringTypeSelector = document.getElementById('recurring-type-selector');
const recurringNote = document.getElementById('recurring-note');
const recurringCategoryChips = document.getElementById('recurring-category-chips');
const recurringAmount = document.getElementById('recurring-amount');
const recurringCurrencyToggle = document.getElementById('recurring-currency-toggle');
const recurringDay = document.getElementById('recurring-day');
const saveRecurringBtn = document.getElementById('save-recurring-btn');
const recurringListEl = document.getElementById('recurring-list');

const budgetListEl = document.getElementById('budget-list');

let authMode = 'login';

toggleSignupBtn.addEventListener('click', () => {
  authMode = authMode === 'login' ? 'signup' : 'login';
  loginError.textContent = '';
  if (authMode === 'signup') {
    loginTitle.textContent = 'Creá tu cuenta';
    loginSubtitle.textContent = 'Tu ticket va a ser privado — nadie más va a poder ver tus movimientos.';
    loginPasswordConfirm.classList.remove('hidden');
    loginPasswordConfirm.required = true;
    loginSubmitBtn.textContent = 'Crear cuenta';
    toggleSignupBtn.textContent = '¿Ya tenés cuenta? Entrar';
  } else {
    loginTitle.textContent = 'Tu ticket';
    loginSubtitle.textContent = 'Anotá cada gasto, ingreso o inversión antes de que se te olvide.';
    loginPasswordConfirm.classList.add('hidden');
    loginPasswordConfirm.required = false;
    loginSubmitBtn.textContent = 'Entrar';
    toggleSignupBtn.textContent = '¿No tenés cuenta? Creá una';
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (authMode === 'signup') {
    const confirm = loginPasswordConfirm.value;
    if (password.length < 6) {
      loginError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }
    if (password !== confirm) {
      loginError.textContent = 'Las contraseñas no coinciden.';
      return;
    }
    if (window.logDebug) window.logDebug('Creando cuenta para ' + email);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      if (window.logDebug) window.logDebug('Cuenta creada OK');
    } catch (err) {
      loginError.textContent = 'Error: ' + err.code;
      if (window.logDebug) window.logDebug('Registro FALLÓ: ' + err.code + ' — ' + err.message);
    }
    return;
  }

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
    await loadPaymentMethods(user.uid);
    await loadBudgets(user.uid);
    renderChips();
    renderPaymentChips();
    renderRecurringCategoryChips();
    subscribeToEntries(user.uid);
    subscribeToRecurring(user.uid);
  } else {
    currentUid = null;
    appScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    if (unsubscribeEntries) unsubscribeEntries();
    if (unsubscribeRecurring) unsubscribeRecurring();
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
  recurringCategory = CATEGORIES[recurringType][0];
}

async function saveCategories() {
  if (!currentUid) return;
  const ref = doc(db, 'usuarios', currentUid, 'config', 'categorias');
  await setDoc(ref, CATEGORIES);
}

async function loadPaymentMethods(uid) {
  const ref = doc(db, 'usuarios', uid, 'config', 'formasDePago');
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().metodos && snap.data().metodos.length) {
    PAYMENT_METHODS = snap.data().metodos;
  } else {
    PAYMENT_METHODS = [...DEFAULT_PAYMENT_METHODS];
    await setDoc(ref, { metodos: PAYMENT_METHODS });
  }
  currentPayment = PAYMENT_METHODS[0];
}

async function savePaymentMethods() {
  if (!currentUid) return;
  const ref = doc(db, 'usuarios', currentUid, 'config', 'formasDePago');
  await setDoc(ref, { metodos: PAYMENT_METHODS });
}

async function loadBudgets(uid) {
  const ref = doc(db, 'usuarios', uid, 'config', 'presupuestos');
  const snap = await getDoc(ref);
  budgets = snap.exists() ? snap.data() : {};
}

async function saveBudget(category, amount) {
  if (!currentUid) return;
  const ref = doc(db, 'usuarios', currentUid, 'config', 'presupuestos');
  if (amount === null) {
    const copy = { ...budgets };
    delete copy[category];
    budgets = copy;
  } else {
    budgets[category] = amount;
  }
  await setDoc(ref, budgets);
}

function renderBudgetList() {
  budgetListEl.innerHTML = '';
  CATEGORIES.gasto.forEach((cat) => {
    const now = new Date();
    const monthKey = now.toISOString().slice(0, 7);
    const spent = allEntries
      .filter(e => e.type === 'gasto' && e.category === cat && e.date.slice(0, 7) === monthKey && (e.currency || 'ARS') === 'ARS')
      .reduce((sum, e) => sum + e.amount, 0);
    const limit = budgets[cat];

    const item = document.createElement('div');
    item.className = 'budget-item' + (limit && spent > limit ? ' over' : '');
    const progressText = limit
      ? fmt(spent, 'ARS') + ' de ' + fmt(limit, 'ARS')
      : fmt(spent, 'ARS') + ' gastados este mes';
    item.innerHTML = `
      <div>
        <span class="bi-name">${escapeHtml(cat)}</span><br>
        <span class="bi-progress">${progressText}</span>
      </div>
      <input type="number" placeholder="Sin límite" value="${limit || ''}">
    `;
    const input = item.querySelector('input');
    input.addEventListener('change', async () => {
      const val = parseFloat(input.value);
      await saveBudget(cat, val && val > 0 ? val : null);
      renderBudgetList();
      renderBudgetAlerts();
    });
    budgetListEl.appendChild(item);
  });
}

function renderBudgetAlerts() {
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  budgetAlertsEl.innerHTML = '';
  Object.keys(budgets).forEach((cat) => {
    const limit = budgets[cat];
    if (!limit) return;
    const spent = allEntries
      .filter(e => e.type === 'gasto' && e.category === cat && e.date.slice(0, 7) === monthKey && (e.currency || 'ARS') === 'ARS')
      .reduce((sum, e) => sum + e.amount, 0);
    if (spent > limit) {
      const div = document.createElement('div');
      div.className = 'budget-alert';
      div.textContent = 'Te pasaste del presupuesto de ' + cat + ': ' + fmt(spent, 'ARS') + ' de ' + fmt(limit, 'ARS');
      budgetAlertsEl.appendChild(div);
    }
  });
}

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

editPaymentsBtn.addEventListener('click', () => {
  paymentEditor.classList.toggle('hidden');
  renderPaymentEditor();
});

closePaymentEditorBtn.addEventListener('click', () => {
  paymentEditor.classList.add('hidden');
});

function renderPaymentEditor() {
  paymentEditorList.innerHTML = '';
  PAYMENT_METHODS.forEach((method) => {
    const item = document.createElement('div');
    item.className = 'cat-editor-chip';
    item.innerHTML = '<span>' + escapeHtml(method) + '</span><button title="Eliminar">×</button>';
    item.querySelector('button').addEventListener('click', () => removePaymentMethod(method));
    paymentEditorList.appendChild(item);
  });
}

addPaymentBtn.addEventListener('click', addPaymentFromInput);
newPaymentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addPaymentFromInput(); }
});

async function addPaymentFromInput() {
  const name = newPaymentInput.value.trim();
  if (!name) return;
  if (PAYMENT_METHODS.some(m => m.toLowerCase() === name.toLowerCase())) {
    newPaymentInput.value = '';
    return;
  }
  PAYMENT_METHODS.push(name);
  newPaymentInput.value = '';
  await savePaymentMethods();
  renderPaymentEditor();
  renderPaymentChips();
}

async function removePaymentMethod(name) {
  if (PAYMENT_METHODS.length <= 1) return; // siempre dejar al menos una
  PAYMENT_METHODS = PAYMENT_METHODS.filter(m => m !== name);
  if (currentPayment === name) currentPayment = PAYMENT_METHODS[0];
  await savePaymentMethods();
  renderPaymentEditor();
  renderPaymentChips();
}

currencyToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.curr-btn');
  if (!btn) return;
  currentCurrency = btn.dataset.currency;
  currencySignLabel.textContent = CURRENCY_SIGN[currentCurrency];
  [...currencyToggle.children].forEach(b => b.classList.toggle('active', b === btn));
});

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
    item.innerHTML = '<span>' + escapeHtml(cat) + '</span><button title="Eliminar">×</button>';
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
  renderRecurringCategoryChips();
  if (currentType === 'gasto') renderBudgetList();
}

async function removeCategory(name) {
  if (CATEGORIES[currentType].length <= 1) return;
  CATEGORIES[currentType] = CATEGORIES[currentType].filter(c => c !== name);
  if (currentCategory === name) currentCategory = CATEGORIES[currentType][0];
  await saveCategories();
  renderCategoryEditor();
  renderChips();
  renderRecurringCategoryChips();
  if (currentType === 'gasto') renderBudgetList();
}

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
      currency: currentCurrency,
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

toggleRecurringBtn.addEventListener('click', () => {
  recurringForm.classList.toggle('hidden');
});

recurringTypeSelector.addEventListener('click', (e) => {
  const btn = e.target.closest('.type-btn');
  if (!btn) return;
  recurringType = btn.dataset.type;
  [...recurringTypeSelector.children].forEach(b => b.classList.toggle('active', b === btn));
  recurringCategory = CATEGORIES[recurringType][0];
  renderRecurringCategoryChips();
});

function renderRecurringCategoryChips() {
  recurringCategoryChips.innerHTML = '';
  CATEGORIES[recurringType].forEach((cat) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (cat === recurringCategory ? ' active' : '');
    chip.textContent = cat;
    chip.addEventListener('click', () => {
      recurringCategory = cat;
      [...recurringCategoryChips.children].forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
    recurringCategoryChips.appendChild(chip);
  });
}
renderRecurringCategoryChips();

recurringCurrencyToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.curr-btn');
  if (!btn) return;
  recurringCurrency = btn.dataset.currency;
  [...recurringCurrencyToggle.children].forEach(b => b.classList.toggle('active', b === btn));
});

saveRecurringBtn.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return;
  const amount = parseFloat(recurringAmount.value);
  const day = parseInt(recurringDay.value, 10);
  const note = recurringNote.value.trim();
  if (!amount || amount <= 0 || !day || day < 1 || day > 28 || !note) {
    alert('Completá el nombre, el monto y un día válido (1-28).');
    return;
  }
  await addDoc(collection(db, 'usuarios', user.uid, 'recurrentes'), {
    type: recurringType,
    category: recurringCategory,
    amount: amount,
    currency: recurringCurrency,
    note: note,
    dayOfMonth: day,
    lastGeneratedMonth: null,
    createdAt: serverTimestamp()
  });
  recurringNote.value = '';
  recurringAmount.value = '';
  recurringDay.value = 1;
  recurringForm.classList.add('hidden');
});

function subscribeToRecurring(uid) {
  const q = query(collection(db, 'usuarios', uid, 'recurrentes'), orderBy('dayOfMonth', 'asc'));
  unsubscribeRecurring = onSnapshot(q, (snap) => {
    recurringDefs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRecurringList();
    generateDueRecurring();
  });
}

function renderRecurringList() {
  recurringListEl.innerHTML = '';
  if (recurringDefs.length === 0) {
    recurringListEl.innerHTML = '<p class="empty-state">Todavía no tenés recurrentes cargados.</p>';
    return;
  }
  recurringDefs.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'config-item';
    item.innerHTML = `
      <div class="ci-main">
        <span class="ci-name">${escapeHtml(r.note)}</span>
        <span class="ci-detail">${LABELS[r.type]} · ${escapeHtml(r.category)} · día ${r.dayOfMonth}</span>
      </div>
      <span class="ci-amount">${fmt(r.amount, r.currency || 'ARS')}</span>
      <button class="ci-del" title="Eliminar">×</button>
    `;
    item.querySelector('.ci-del').addEventListener('click', async () => {
      const user = auth.currentUser;
      if (!user) return;
      await deleteDoc(doc(db, 'usuarios', user.uid, 'recurrentes', r.id));
    });
    recurringListEl.appendChild(item);
  });
}

async function generateDueRecurring() {
  const user = auth.currentUser;
  if (!user) return;
  const now = new Date();
  const currentMonthKey = now.toISOString().slice(0, 7);
  const todayDay = now.getDate();

  for (const r of recurringDefs) {
    if (r.lastGeneratedMonth === currentMonthKey) continue;
    if (todayDay < r.dayOfMonth) continue;
    const entryDate = new Date(now.getFullYear(), now.getMonth(), r.dayOfMonth);
    await addDoc(collection(db, 'usuarios', user.uid, 'movimientos'), {
      type: r.type,
      category: r.category,
      paymentMethod: 'Automático',
      amount: r.amount,
      currency: r.currency || 'ARS',
      note: r.note + ' (recurrente)',
      date: entryDate.toISOString(),
      createdAt: serverTimestamp()
    });
    await setDoc(doc(db, 'usuarios', user.uid, 'recurrentes', r.id), { ...r, lastGeneratedMonth: currentMonthKey });
    if (window.logDebug) window.logDebug('Recurrente generado: ' + r.note);
  }
}

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

function fmt(n, currency) {
  const sign = CURRENCY_SIGN[currency || 'ARS'];
  return sign + ' ' + Math.round(n).toLocaleString('es-AR');
}

function entryRow(entry) {
  const row = document.createElement('div');
  row.className = 'entry-row';
  row.innerHTML = `
    <span class="entry-cat">${entry.category}</span>
    ${entry.paymentMethod ? '<span class="entry-payment">' + escapeHtml(entry.paymentMethod) + '</span>' : ''}
    ${entry.note ? '<span class="entry-note">' + escapeHtml(entry.note) + '</span>' : ''}
    <span class="entry-fill"></span>
    <span class="entry-amount ${entry.type}">${entry.type === 'gasto' ? '-' : '+'}${fmt(entry.amount, entry.currency)}</span>
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

  todayDateEl.textContent = now.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  const todays = allEntries.filter(e => new Date(e.date).toDateString() === todayKey);
  todayList.innerHTML = '';
  if (todays.length === 0) {
    todayList.innerHTML = '<p class="empty-state">Todavía no cargaste nada hoy. Arriba tenés el primer renglón.</p>';
  } else {
    todays.forEach(e => todayList.appendChild(entryRow(e)));
  }

  const monthKeys = new Set(allEntries.map(e => e.date.slice(0, 7)));
  const currentMonthKey = now.toISOString().slice(0, 7);
  monthKeys.add(currentMonthKey);
  const sortedMonths = [...monthKeys].sort().reverse();

  const prevSelection = monthFilter.value;
  monthFilter.innerHTML = '';
  sortedMonths.forEach(mk => {
    const opt = document.createElement('option');
    opt.value = mk;
    const parts = mk.split('-');
    opt.textContent = new Date(parts[0], parts[1] - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    monthFilter.appendChild(opt);
  });
  monthFilter.value = sortedMonths.includes(prevSelection) ? prevSelection : currentMonthKey;

  renderHistory();
  renderSummary();
  renderBudgetList();
  renderBudgetAlerts();
}

function getFilteredEntries() {
  if (viewMode === 'range' && rangeFrom && rangeTo) {
    return allEntries.filter(e => {
      const d = e.date.slice(0, 10);
      return d >= rangeFrom && d <= rangeTo;
    });
  }
  const monthKey = monthFilter.value;
  return allEntries.filter(e => e.date.slice(0, 7) === monthKey);
}

function renderHistory() {
  const entries = getFilteredEntries();
  historyList.innerHTML = '';
  if (entries.length === 0) {
    historyList.innerHTML = '<p class="empty-state">Sin movimientos en este período.</p>';
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
  const entries = getFilteredEntries();
  balancePeriodLabel.textContent = viewMode === 'range' ? 'Balance del rango elegido' : 'Balance del mes';

  const currencies = ['ARS', 'USD'];
  balanceCardsEl.innerHTML = '';

  currencies.forEach((cur) => {
    const inCurrency = entries.filter(e => (e.currency || 'ARS') === cur);
    if (cur === 'USD' && !allEntries.some(e => e.currency === 'USD')) return;

    const totals = { gasto: 0, ingreso: 0, inversion: 0 };
    inCurrency.forEach(e => { totals[e.type] += e.amount; });
    const balance = totals.ingreso - totals.gasto - totals.inversion;

    const card = document.createElement('div');
    card.className = 'balance-card';
    card.innerHTML = `
      <span class="balance-card-label">${cur}</span>
      <span class="balance-amount">${fmt(balance, cur)}</span>
      <div class="balance-breakdown">
        <div class="bd-item bd-ingreso"><span class="dot"></span>Ingresos <b>${fmt(totals.ingreso, cur)}</b></div>
        <div class="bd-item bd-gasto"><span class="dot"></span>Gastos <b>${fmt(totals.gasto, cur)}</b></div>
        <div class="bd-item bd-inversion"><span class="dot"></span>Inversión <b>${fmt(totals.inversion, cur)}</b></div>
      </div>
    `;
    balanceCardsEl.appendChild(card);
  });
}

monthFilter.addEventListener('change', () => {
  renderHistory();
  renderSummary();
});

toggleRangeBtn.addEventListener('click', () => {
  rangePicker.classList.toggle('hidden');
  monthFilter.classList.add('hidden');
});

cancelRangeBtn.addEventListener('click', () => {
  viewMode = 'month';
  rangePicker.classList.add('hidden');
  monthFilter.classList.remove('hidden');
  renderHistory();
  renderSummary();
});

applyRangeBtn.addEventListener('click', () => {
  if (!rangeFromInput.value || !rangeToInput.value) return;
  rangeFrom = rangeFromInput.value;
  rangeTo = rangeToInput.value;
  viewMode = 'range';
  renderHistory();
  renderSummary();
});
