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
let currentInvestmentDirection = 'aporte';

let recurringType = 'gasto';
let recurringCategory = CATEGORIES.gasto[0];
let recurringCurrency = 'ARS';

let allEntries = [];
let recurringDefs = [];
let debtDefs = [];
let debtCurrency = 'ARS';
let debtType = 'debo';
let budgets = {};
let unsubscribeEntries = null;
let unsubscribeRecurring = null;
let unsubscribeDebts = null;
let currentUid = null;
let viewMode = 'month';
let rangeFrom = null;
let rangeTo = null;

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const onboardingScreen = document.getElementById('onboarding-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const loginTitle = document.getElementById('login-title');
const loginSubtitle = document.getElementById('login-subtitle');
const loginPasswordConfirm = document.getElementById('login-password-confirm');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const toggleSignupBtn = document.getElementById('toggle-signup-btn');

const typeSelector = document.getElementById('type-selector');
const investmentDirectionSelector = document.getElementById('investment-direction-selector');
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
const investmentTotalEl = document.getElementById('investment-total');
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

const toggleDebtBtn = document.getElementById('toggle-debt-btn');
const debtForm = document.getElementById('debt-form');
const debtTypeSelector = document.getElementById('debt-type-selector');
const debtName = document.getElementById('debt-name');
const debtAmount = document.getElementById('debt-amount');
const debtCurrencyToggle = document.getElementById('debt-currency-toggle');
const debtNote = document.getElementById('debt-note');
const saveDebtBtn = document.getElementById('save-debt-btn');
const debtListEl = document.getElementById('debt-list');

const onbSaldoArs = document.getElementById('onb-saldo-ars');
const onbSaldoUsd = document.getElementById('onb-saldo-usd');
const onbInversionesList = document.getElementById('onb-inversiones-list');
const onbAddInversionBtn = document.getElementById('onb-add-inversion');
const onbDeudasList = document.getElementById('onb-deudas-list');
const onbAddDeudaBtn = document.getElementById('onb-add-deuda');
const onbSkipBtn = document.getElementById('onb-skip-btn');
const onbSaveBtn = document.getElementById('onb-save-btn');

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
    await loadCategories(user.uid);
    await loadPaymentMethods(user.uid);
    await loadBudgets(user.uid);
    renderChips();
    renderPaymentChips();
    renderRecurringCategoryChips();
    subscribeToEntries(user.uid);
    subscribeToRecurring(user.uid);
    subscribeToDebts(user.uid);

    const onbRef = doc(db, 'usuarios', user.uid, 'config', 'onboarding');
    const onbSnap = await getDoc(onbRef);
    if (onbSnap.exists() && onbSnap.data().completado) {
      appScreen.classList.remove('hidden');
    } else {
      onboardingScreen.classList.remove('hidden');
    }
  } else {
    currentUid = null;
    appScreen.classList.add('hidden');
    onboardingScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    if (unsubscribeEntries) unsubscribeEntries();
    if (unsubscribeRecurring) unsubscribeRecurring();
    if (unsubscribeDebts) unsubscribeDebts();
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

  investmentDirectionSelector.classList.toggle('hidden', currentType !== 'inversion');
  currentInvestmentDirection = 'aporte';
  [...investmentDirectionSelector.children].forEach(b => b.classList.toggle('active', b.dataset.direction === 'aporte'));
});

investmentDirectionSelector.addEventListener('click', (e) => {
  const btn = e.target.closest('.type-btn');
  if (!btn) return;
  currentInvestmentDirection = btn.dataset.direction;
  [...investmentDirectionSelector.children].forEach(b => b.classList.toggle('active', b === btn));
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
      direccion: currentType === 'inversion' ? currentInvestmentDirection : null,
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

// ---------- Onboarding (primera vez) ----------
function addOnbRow(container, placeholderName) {
  const row = document.createElement('div');
  row.className = 'onb-row';
  row.innerHTML = `
    <input type="text" placeholder="${placeholderName}" class="onb-row-name">
    <input type="number" inputmode="decimal" placeholder="Monto" class="onb-row-amount">
    <select class="onb-row-currency">
      <option value="ARS">ARS</option>
      <option value="USD">USD</option>
    </select>
    <button type="button" class="onb-row-del" title="Quitar">×</button>
  `;
  row.querySelector('.onb-row-del').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

onbAddInversionBtn.addEventListener('click', () => addOnbRow(onbInversionesList, 'Nombre (ej. Plazo fijo)'));
onbAddDeudaBtn.addEventListener('click', () => addOnbRow(onbDeudasList, 'Nombre (ej. Tarjeta Visa)'));

// Arrancan con una fila vista cada uno
addOnbRow(onbInversionesList, 'Nombre (ej. Plazo fijo)');
addOnbRow(onbDeudasList, 'Nombre (ej. Tarjeta Visa)');

async function finishOnboarding() {
  const user = auth.currentUser;
  if (!user) return;
  await setDoc(doc(db, 'usuarios', user.uid, 'config', 'onboarding'), { completado: true });
  onboardingScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
}

onbSkipBtn.addEventListener('click', async () => {
  await finishOnboarding();
});

onbSaveBtn.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return;
  onbSaveBtn.disabled = true;
  try {
    const saldoArs = parseFloat(onbSaldoArs.value);
    const saldoUsd = parseFloat(onbSaldoUsd.value);
    const now = new Date().toISOString();

    if (saldoArs && saldoArs > 0) {
      await addDoc(collection(db, 'usuarios', user.uid, 'movimientos'), {
        type: 'ingreso', category: 'Sueldo', paymentMethod: 'Saldo inicial',
        amount: saldoArs, currency: 'ARS', note: 'Saldo inicial',
        date: now, createdAt: serverTimestamp()
      });
    }
    if (saldoUsd && saldoUsd > 0) {
      await addDoc(collection(db, 'usuarios', user.uid, 'movimientos'), {
        type: 'ingreso', category: 'Sueldo', paymentMethod: 'Saldo inicial',
        amount: saldoUsd, currency: 'USD', note: 'Saldo inicial',
        date: now, createdAt: serverTimestamp()
      });
    }

    for (const row of onbInversionesList.querySelectorAll('.onb-row')) {
      const nombre = row.querySelector('.onb-row-name').value.trim();
      const monto = parseFloat(row.querySelector('.onb-row-amount').value);
      const currency = row.querySelector('.onb-row-currency').value;
      if (!nombre || !monto || monto <= 0) continue;
      await addDoc(collection(db, 'usuarios', user.uid, 'movimientos'), {
        type: 'inversion', category: 'Otros', paymentMethod: 'Saldo inicial',
        amount: monto, currency: currency, note: nombre,
        date: now, createdAt: serverTimestamp()
      });
      // Contrapartida: esta plata ya la tenías, no "salió" de ningún lado hoy
      await addDoc(collection(db, 'usuarios', user.uid, 'movimientos'), {
        type: 'ingreso', category: 'Otros', paymentMethod: 'Saldo inicial',
        amount: monto, currency: currency, note: 'Contrapartida: ' + nombre,
        date: now, createdAt: serverTimestamp()
      });
    }

    for (const row of onbDeudasList.querySelectorAll('.onb-row')) {
      const nombre = row.querySelector('.onb-row-name').value.trim();
      const monto = parseFloat(row.querySelector('.onb-row-amount').value);
      const currency = row.querySelector('.onb-row-currency').value;
      if (!nombre || !monto || monto <= 0) continue;
      await addDoc(collection(db, 'usuarios', user.uid, 'deudas'), {
        nombre: nombre, montoTotal: monto, currency: currency, tipo: 'debo',
        nota: 'Cargada al empezar', montoPagado: 0, createdAt: serverTimestamp()
      });
    }

    await finishOnboarding();
  } catch (err) {
    alert('No se pudo guardar. Probá de nuevo.');
    if (window.logDebug) window.logDebug('Onboarding FALLÓ: ' + err.message);
  } finally {
    onbSaveBtn.disabled = false;
  }
});

// ---------- Deudas ----------
toggleDebtBtn.addEventListener('click', () => {
  debtForm.classList.toggle('hidden');
});

debtTypeSelector.addEventListener('click', (e) => {
  const btn = e.target.closest('.type-btn');
  if (!btn) return;
  debtType = btn.dataset.debttype;
  [...debtTypeSelector.children].forEach(b => b.classList.toggle('active', b === btn));
});

debtCurrencyToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.curr-btn');
  if (!btn) return;
  debtCurrency = btn.dataset.currency;
  [...debtCurrencyToggle.children].forEach(b => b.classList.toggle('active', b === btn));
});

saveDebtBtn.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return;
  const nombre = debtName.value.trim();
  const monto = parseFloat(debtAmount.value);
  if (!nombre || !monto || monto <= 0) {
    alert('Completá el nombre y el monto total de la deuda.');
    return;
  }
  await addDoc(collection(db, 'usuarios', user.uid, 'deudas'), {
    nombre: nombre,
    montoTotal: monto,
    currency: debtCurrency,
    tipo: debtType,
    nota: debtNote.value.trim(),
    montoPagado: 0,
    createdAt: serverTimestamp()
  });
  debtName.value = '';
  debtAmount.value = '';
  debtNote.value = '';
  debtForm.classList.add('hidden');
});

function subscribeToDebts(uid) {
  const q = query(collection(db, 'usuarios', uid, 'deudas'), orderBy('createdAt', 'desc'));
  unsubscribeDebts = onSnapshot(q, (snap) => {
    debtDefs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderDebtList();
  });
}

function renderDebtList() {
  debtListEl.innerHTML = '';
  if (debtDefs.length === 0) {
    debtListEl.innerHTML = '<p class="empty-state">No tenés deudas cargadas.</p>';
    return;
  }
  debtDefs.forEach((d) => {
    const tipo = d.tipo || 'debo'; // compatibilidad con deudas creadas antes de este cambio
    const saldo = d.montoTotal - d.montoPagado;
    const esDebo = tipo === 'debo';
    const card = document.createElement('div');
    card.className = 'debt-card';
    const balanceLabel = saldo <= 0
      ? (esDebo ? 'Saldada' : 'Cobrada')
      : (esDebo ? '-' + fmt(saldo, d.currency) + ' pendiente' : '+' + fmt(saldo, d.currency) + ' pendiente');
    const payLabel = esDebo ? 'Pagar' : 'Cobrar';
    card.innerHTML = `
      <div class="debt-card-top">
        <span class="debt-name">${escapeHtml(d.nombre)} <span class="debt-tag">${esDebo ? 'Debo' : 'Me deben'}</span></span>
        <span class="debt-balance ${saldo <= 0 ? 'paid' : (esDebo ? 'owe' : 'owed')}">${balanceLabel}</span>
      </div>
      <div class="debt-detail">${fmt(d.montoPagado, d.currency)} ${esDebo ? 'pagado' : 'cobrado'} de ${fmt(d.montoTotal, d.currency)}${d.nota ? ' · ' + escapeHtml(d.nota) : ''}</div>
      ${saldo > 0 ? `
      <div class="debt-pay-row">
        <input type="number" inputmode="decimal" placeholder="Monto en ${d.currency}" class="debt-pay-amount">
        <button type="button" class="btn-small debt-pay-btn">${payLabel}</button>
      </div>
      <button type="button" class="link-btn debt-pay-othercur-toggle">¿${esDebo ? 'Pagaste' : 'Cobraste'} en otra moneda?</button>
      <div class="debt-pay-othercur hidden">
        <select class="debt-pay-othercur-select">
          <option value="ARS" ${d.currency === 'ARS' ? 'disabled' : ''}>ARS</option>
          <option value="USD" ${d.currency === 'USD' ? 'disabled' : ''}>USD</option>
        </select>
        <input type="number" inputmode="decimal" placeholder="Monto real ${esDebo ? 'pagado' : 'cobrado'}" class="debt-pay-othercur-amount">
      </div>` : ''}
      <div class="debt-card-actions">
        <button type="button" class="debt-del">Eliminar deuda</button>
      </div>
    `;
    if (saldo > 0) {
      const payInput = card.querySelector('.debt-pay-amount');
      const otherCurToggle = card.querySelector('.debt-pay-othercur-toggle');
      const otherCurBox = card.querySelector('.debt-pay-othercur');
      const otherCurSelect = card.querySelector('.debt-pay-othercur-select');
      const otherCurAmount = card.querySelector('.debt-pay-othercur-amount');
      otherCurToggle.addEventListener('click', () => otherCurBox.classList.toggle('hidden'));
      card.querySelector('.debt-pay-btn').addEventListener('click', () => {
        const usingOtherCur = !otherCurBox.classList.contains('hidden') && otherCurAmount.value;
        registerDebtPayment(
          d, payInput,
          usingOtherCur ? otherCurSelect.value : null,
          usingOtherCur ? otherCurAmount.value : null
        );
        otherCurAmount.value = '';
      });
    }
    card.querySelector('.debt-del').addEventListener('click', async () => {
      const user = auth.currentUser;
      if (!user) return;
      await deleteDoc(doc(db, 'usuarios', user.uid, 'deudas', d.id));
    });
    debtListEl.appendChild(card);
  });
}

async function registerDebtPayment(debt, inputEl, otherCurrency, otherAmount) {
  const user = auth.currentUser;
  if (!user) return;
  const monto = parseFloat(inputEl.value);
  if (!monto || monto <= 0) {
    inputEl.focus();
    return;
  }
  const tipo = debt.tipo || 'debo';
  const nuevoPagado = debt.montoPagado + monto;
  await setDoc(doc(db, 'usuarios', user.uid, 'deudas', debt.id), { montoPagado: nuevoPagado }, { merge: true });

  const realCurrency = otherCurrency || debt.currency;
  const realAmount = otherAmount ? parseFloat(otherAmount) : monto;

  await addDoc(collection(db, 'usuarios', user.uid, 'movimientos'), {
    type: tipo === 'debo' ? 'gasto' : 'ingreso',
    category: tipo === 'debo' ? 'Pago de deuda' : 'Cobro de deuda',
    paymentMethod: currentPayment,
    amount: realAmount,
    currency: realCurrency,
    note: (tipo === 'debo' ? 'Pago de ' : 'Cobro de ') + debt.nombre +
      (realCurrency !== debt.currency ? ' (deuda en ' + debt.currency + ', pagado en ' + realCurrency + ')' : ''),
    date: new Date().toISOString(),
    createdAt: serverTimestamp()
  });
  inputEl.value = '';
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

function signedInversion(entry) {
  return entry.direccion === 'retiro' ? -entry.amount : entry.amount;
}

function entryRow(entry) {
  const row = document.createElement('div');
  row.className = 'entry-row';
  let sign = '+';
  if (entry.type === 'gasto') sign = '-';
  else if (entry.type === 'inversion') sign = entry.direccion === 'retiro' ? '+' : '-';
  const dirTag = entry.type === 'inversion' ? (entry.direccion === 'retiro' ? ' (retiro)' : '') : '';
  row.innerHTML = `
    <span class="entry-cat">${entry.category}${dirTag}</span>
    ${entry.paymentMethod ? '<span class="entry-payment">' + escapeHtml(entry.paymentMethod) + '</span>' : ''}
    ${entry.note ? '<span class="entry-note">' + escapeHtml(entry.note) + '</span>' : ''}
    <span class="entry-fill"></span>
    <span class="entry-amount ${entry.type}">${sign}${fmt(entry.amount, entry.currency)}</span>
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
  renderInvestmentTotal();
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
    inCurrency.forEach(e => {
      if (e.type === 'inversion') totals.inversion += signedInversion(e);
      else totals[e.type] += e.amount;
    });
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

function renderInvestmentTotal() {
  const totals = { ARS: 0, USD: 0 };
  allEntries.forEach(e => {
    if (e.type === 'inversion') totals[e.currency || 'ARS'] += signedInversion(e);
  });
  investmentTotalEl.innerHTML = `
    <span class="it-label">Invertido en total</span>
    <span class="it-item"><b>${fmt(totals.ARS, 'ARS')}</b></span>
    ${totals.USD > 0 ? `<span class="it-item"><b>${fmt(totals.USD, 'USD')}</b></span>` : ''}
  `;
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
