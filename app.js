/* ═══════════════════════════════════════════════
   StudyWallet – app.js
   Full Supabase integration + AI Chatbot + Games
   ═══════════════════════════════════════════════ */

// ── SUPABASE CONFIG ──────────────────────────────
const SUPABASE_URL = 'https://mytwoztlfzawxnyyylaf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15dHdvenRsZnphd3hueXl5bGFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTI2NTAsImV4cCI6MjA4NzA4ODY1MH0.CXwXFp5Tm2xkB_9uiOcrFxgzwjf_6RYrHiu19yxcUiw';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── APP STATE ───────────────────────────────────
let APP = {
  user: null,
  profile: null,
  incomes: [],
  expenses: [],
  goals: [],
  gameScores: [],
  currency: '₹',
  chatMode: 'finance',
  chatHistory: [],
  apiKey: '',
  _modalType: 'expense',
  _gameIntervals: [],
  _pendingDeleteId: null,
  _pendingDeleteType: null,
  _editingId: null,
};

let pieChart = null, barChart = null;

// ══════════════════════════════════════════════
//  SUPABASE AUTH
// ══════════════════════════════════════════════
async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    APP.user = session.user;
    await bootApp();
  } else {
    showAuth();
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      APP.user = session.user;
      await bootApp();
    } else if (event === 'SIGNED_OUT') {
      showAuth();
    }
  });
}

async function handleLogin() {
  const email = val('loginEmail'), password = val('loginPassword');
  if (!email || !password) { showAuthErr('loginError', 'Please fill in all fields'); return; }
  setLoading('loginBtn', true);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setLoading('loginBtn', false);
  if (error) showAuthErr('loginError', error.message);
}

async function handleSignup() {
  const name = val('signupName'), email = val('signupEmail'), password = val('signupPassword');
  if (!name || !email || !password) { showAuthErr('signupError', 'Please fill in all fields'); return; }
  if (password.length < 6) { showAuthErr('signupError', 'Password must be at least 6 characters'); return; }
  setLoading('signupBtn', true);
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
  setLoading('signupBtn', false);
  if (error) { showAuthErr('signupError', error.message); return; }
  show('signupSuccess', 'Check your email to confirm your account! Then sign in.');
}

async function handleGoogleLogin() {
  await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
}

async function handleReset() {
  const email = val('resetEmail');
  if (!email) { toast('Enter your email', 'error'); return; }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) { toast(error.message, 'error'); return; }
  show('resetMsg', '✅ Reset link sent! Check your email.');
}

async function handlePasswordReset() {
  if (!APP.user?.email) return;
  const { error } = await supabase.auth.resetPasswordForEmail(APP.user.email, { redirectTo: window.location.origin });
  if (!error) toast('📧 Password reset email sent!', 'success'); else toast(error.message, 'error');
}

async function handleLogout() {
  await supabase.auth.signOut();
  APP = { ...APP, user: null, profile: null, incomes: [], expenses: [], goals: [], gameScores: [] };
  showAuth();
}

// ══════════════════════════════════════════════
//  BOOT APP
// ══════════════════════════════════════════════
async function bootApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  document.getElementById('fab').style.display = 'flex';

  await Promise.all([loadProfile(), loadIncomes(), loadExpenses(), loadGoals(), loadGameScores()]);
  applySettings();
  updateDashboard();
  renderTxPage();
  renderIncomePage();
  renderGoalsPage();
  renderLeaderboard();
  updateAnalytics();
  setupRealtimeSync();
  setDate();
  document.getElementById('txDate').valueAsDate = new Date();
  const nm = new Date(); document.getElementById('goalMonth').value = `${nm.getFullYear()}-${String(nm.getMonth()+1).padStart(2,'0')}`;
  populateMonthFilter();
}

// ══════════════════════════════════════════════
//  DATA LOADERS
// ══════════════════════════════════════════════
async function loadProfile() {
  const { data } = await supabase.from('users').select('*').eq('id', APP.user.id).single();
  if (data) {
    APP.profile = data;
    APP.currency = data.currency || '₹';
  } else {
    // Create profile if doesn't exist
    const meta = APP.user.user_metadata || {};
    await supabase.from('users').insert({
      id: APP.user.id,
      email: APP.user.email,
      full_name: meta.full_name || 'Student',
      currency: '₹',
      monthly_budget: 5000
    });
    const { data: d2 } = await supabase.from('users').select('*').eq('id', APP.user.id).single();
    APP.profile = d2;
    APP.currency = '₹';
  }
}

async function loadIncomes() {
  const { data } = await supabase.from('incomes').select('*').eq('user_id', APP.user.id).order('date', { ascending: false });
  APP.incomes = data || [];
}

async function loadExpenses() {
  const { data } = await supabase.from('expenses').select('*').eq('user_id', APP.user.id).order('date', { ascending: false });
  APP.expenses = data || [];
}

async function loadGoals() {
  const { data } = await supabase.from('savings_goals').select('*').eq('user_id', APP.user.id).order('month', { ascending: false });
  APP.goals = data || [];
}

async function loadGameScores() {
  const { data } = await supabase.from('game_scores').select('*').order('score', { ascending: false });
  APP.gameScores = data || [];
}

// ══════════════════════════════════════════════
//  REALTIME SYNC
// ══════════════════════════════════════════════
function setupRealtimeSync() {
  supabase.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incomes', filter: `user_id=eq.${APP.user.id}` }, async () => {
      await loadIncomes(); updateDashboard(); renderTxPage(); renderIncomePage(); updateAnalytics();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `user_id=eq.${APP.user.id}` }, async () => {
      await loadExpenses(); updateDashboard(); renderTxPage(); updateAnalytics();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'savings_goals', filter: `user_id=eq.${APP.user.id}` }, async () => {
      await loadGoals(); updateDashboard(); renderGoalsPage();
    })
    .subscribe();
}

// ══════════════════════════════════════════════
//  TRANSACTIONS (SUPABASE)
// ══════════════════════════════════════════════
async function addTransaction() {
  const amount = parseFloat(val('txAmt'));
  if (!amount || amount <= 0) { showModalErr('Enter a valid amount'); return; }
  const date = val('txDate') || new Date().toISOString().split('T')[0];
  const notes = val('txNotes');
  setLoading('addTxBtn', true);

  if (APP._modalType === 'expense') {
    const { error } = await supabase.from('expenses').insert({ user_id: APP.user.id, amount, category: val('txCat'), date, notes });
    if (error) { showModalErr(error.message); setLoading('addTxBtn', false); return; }
    await loadExpenses();
  } else {
    const { error } = await supabase.from('incomes').insert({ user_id: APP.user.id, amount, source: val('txSrc'), date, notes });
    if (error) { showModalErr(error.message); setLoading('addTxBtn', false); return; }
    await loadIncomes();
  }

  setLoading('addTxBtn', false);
  closeModal();
  updateDashboard(); renderTxPage(); renderIncomePage(); updateAnalytics();
  toast(`✅ ${APP._modalType === 'income' ? 'Income' : 'Expense'} added: ${cur()}${amount.toFixed(2)}`, 'success');
}

async function deleteTransaction(id, type) {
  APP._pendingDeleteId = id;
  APP._pendingDeleteType = type;
  document.getElementById('confirmModal').classList.add('open');
  document.getElementById('confirmDeleteBtn').onclick = async () => {
    const table = APP._pendingDeleteType === 'income' ? 'incomes' : 'expenses';
    const { error } = await supabase.from(table).delete().eq('id', APP._pendingDeleteId);
    if (error) { toast(error.message, 'error'); closeConfirm(); return; }
    if (APP._pendingDeleteType === 'income') await loadIncomes(); else await loadExpenses();
    updateDashboard(); renderTxPage(); renderIncomePage(); updateAnalytics();
    closeConfirm(); toast('🗑️ Deleted', 'success');
  };
}

async function openEdit(id, type) {
  APP._editingId = id;
  const items = type === 'income' ? APP.incomes : APP.expenses;
  const item = items.find(i => i.id === id);
  if (!item) return;
  set('editId', id); set('editType', type);
  set('editAmt', item.amount);
  set('editDate', item.date);
  set('editNotes', item.notes || '');
  if (type === 'expense') {
    ge('editFgCat').style.display = 'block'; ge('editFgSrc').style.display = 'none';
    set('editCat', item.category);
  } else {
    ge('editFgCat').style.display = 'none'; ge('editFgSrc').style.display = 'block';
    set('editSrc', item.source || 'Other');
  }
  document.getElementById('editModal').classList.add('open');
}

async function saveEdit() {
  const id = val('editId'), type = val('editType');
  const amount = parseFloat(val('editAmt'));
  if (!amount || amount <= 0) { toast('Enter valid amount', 'error'); return; }
  const date = val('editDate'), notes = val('editNotes');
  setLoading('saveEditBtn', true);

  let payload = { amount, date, notes };
  if (type === 'expense') { payload.category = val('editCat'); } else { payload.source = val('editSrc'); }
  const table = type === 'income' ? 'incomes' : 'expenses';
  const { error } = await supabase.from(table).update(payload).eq('id', id);
  setLoading('saveEditBtn', false);
  if (error) { toast(error.message, 'error'); return; }
  if (type === 'income') await loadIncomes(); else await loadExpenses();
  closeEditModal(); updateDashboard(); renderTxPage(); renderIncomePage(); updateAnalytics();
  toast('✅ Updated!', 'success');
}

// ══════════════════════════════════════════════
//  SAVINGS GOALS (SUPABASE)
// ══════════════════════════════════════════════
async function saveGoal() {
  const target = parseFloat(val('goalAmt')), month = val('goalMonth'), title = val('goalTitle') || 'Monthly Savings';
  if (!target || !month) { toast('Fill in all fields', 'error'); return; }
  const existing = APP.goals.find(g => g.month === month);
  let error;
  if (existing) {
    ({ error } = await supabase.from('savings_goals').update({ target_amount: target, title }).eq('id', existing.id));
  } else {
    ({ error } = await supabase.from('savings_goals').insert({ user_id: APP.user.id, target_amount: target, month, title }));
  }
  if (error) { toast(error.message, 'error'); return; }
  await loadGoals(); closeGoalModal(); updateDashboard(); renderGoalsPage();
  toast('✅ Goal saved!', 'success');
}

async function deleteGoal(id) {
  const { error } = await supabase.from('savings_goals').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  await loadGoals(); updateDashboard(); renderGoalsPage(); toast('🗑️ Goal deleted', 'success');
}

// ══════════════════════════════════════════════
//  PROFILE SAVE
// ══════════════════════════════════════════════
async function saveProfile() {
  const full_name = val('settingName') || 'Student';
  const currency = val('currencySelect') || '₹';
  const monthly_budget = parseFloat(val('settingBudget')) || 5000;
  APP.apiKey = val('apiKeyInput');

  const { error } = await supabase.from('users').update({ full_name, currency, monthly_budget }).eq('id', APP.user.id);
  if (error) { toast(error.message, 'error'); return; }
  APP.currency = currency;
  if (APP.profile) { APP.profile.full_name = full_name; APP.profile.currency = currency; APP.profile.monthly_budget = monthly_budget; }
  applySettings(); updateDashboard(); toast('✅ Profile saved!', 'success');
}

async function saveCurrency() {
  const currency = val('currencySelect');
  APP.currency = currency;
  await supabase.from('users').update({ currency }).eq('id', APP.user.id);
  updateDashboard(); renderTxPage(); renderIncomePage();
}

// ══════════════════════════════════════════════
//  APPLY SETTINGS TO UI
// ══════════════════════════════════════════════
function applySettings() {
  if (!APP.profile) return;
  const name = APP.profile.full_name || APP.user?.email?.split('@')[0] || 'Student';
  const initial = name.charAt(0).toUpperCase();
  setText('sidebarName', name); setText('sidebarAvatar', initial);
  setText('profileAvatarLg', initial); setText('profileDisplayName', name);
  setText('profileDisplayEmail', APP.user?.email || '');
  set('settingName', name);
  set('settingUni', APP.profile.university || '');
  set('settingBudget', APP.profile.monthly_budget || 5000);
  set('currencySelect', APP.currency);
  if (APP.apiKey) set('apiKeyInput', APP.apiKey);
}

// ══════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════
function updateDashboard() {
  const now = new Date();
  const ym = ymStr(now);
  const income = monthSum(APP.incomes, ym);
  const expense = monthSum(APP.expenses, ym);
  const balance = income - expense;

  setText('statIncome', fmt(income));
  setText('statExpense', fmt(expense));
  setText('statBalance', fmt(balance));
  setText('statBalanceSub', balance > 0 ? '💚 Looking good!' : balance < 0 ? '🔴 Over budget!' : '⚠️ Break even');

  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - dayOfMonth;
  const avgDaily = dayOfMonth > 0 ? expense / dayOfMonth : 0;
  const survivalDays = avgDaily > 0 ? Math.max(0, Math.floor(balance / avgDaily)) : daysLeft;
  const safeDaily = daysLeft > 0 ? Math.max(0, balance / daysLeft) : 0;

  setText('survivalDays', Math.max(0, survivalDays));
  setText('statDailyLimit', fmt(safeDaily));

  const note = avgDaily > 0 ? `Avg daily spend: ${fmt(avgDaily)}` : 'No spending recorded yet';
  setText('survivalNote', note);

  // Goal progress
  const goal = APP.goals.find(g => g.month === ym);
  if (goal) {
    const saved = Math.max(0, balance);
    const pct = Math.min(100, (saved / goal.target_amount) * 100);
    setText('goalLabel', goal.title || 'Monthly Goal');
    setText('goalFigures', `${fmt(saved)} / ${fmt(goal.target_amount)}`);
    setText('goalPct', `${pct.toFixed(0)}% achieved`);
    setText('goalStatus', pct >= 100 ? '🎉 Goal reached!' : pct >= 60 ? 'Halfway there!' : 'Keep saving!');
    ge('goalBar').style.width = pct + '%';
    ge('goalBar').className = `progress-fill ${pct >= 70 ? 'good' : pct >= 35 ? 'warn' : 'danger'}`;
  }

  setText('sidebarBal', `${fmt(balance)} left`);

  // Recent
  const all = getAllTx().slice(0, 6);
  const rEl = ge('recentActivity');
  rEl.innerHTML = all.length ? `<div class="tx-list">${all.map(t => txItemHTML(t, true)).join('')}</div>` :
    `<div class="empty-state sm"><div>📭</div><p>No transactions yet</p></div>`;

  generateInsights(income, expense, balance, avgDaily);
}

function setDate() {
  const d = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  setText('dashDate', `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`);
  const h = d.getHours();
  const gr = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const em = h < 12 ? '☀️' : h < 17 ? '🌤️' : '🌙';
  const name = APP.profile?.full_name || 'Student';
  ge('dashGreet').innerHTML = `${gr}, <strong>${name}</strong> ${em}`;
}

function generateInsights(income, expense, balance, avgDaily) {
  const insights = [];
  const cats = {};
  APP.expenses.filter(e => e.date?.startsWith(ymStr(new Date()))).forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount; });
  const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];

  if (income === 0) insights.push({ t: 'info', icon: 'ℹ️', msg: 'Add your income to get personalized budgeting insights!' });
  if (balance < 0) insights.push({ t: 'alert', icon: '🚨', msg: `Over budget by ${fmt(-balance)}! Cut back on non-essentials immediately.` });
  else if (income > 0 && balance < income * 0.1) insights.push({ t: 'warn', icon: '⚠️', msg: `Only ${fmt(balance)} left! You've spent ${((expense/income)*100).toFixed(0)}% of income.` });
  else if (income > 0 && balance > income * 0.35) insights.push({ t: 'good', icon: '💚', msg: `Great savings! You've kept ${fmt(balance)} (${((balance/income)*100).toFixed(0)}% of income).` });

  if (topCat) insights.push({ t: 'info', icon: '📊', msg: `Biggest spend: ${topCat[0]} at ${fmt(topCat[1])} (${income > 0 ? ((topCat[1]/income)*100).toFixed(0) : '—'}% of income)` });
  if (cats['Food'] > income * 0.3 && income > 0) insights.push({ t: 'warn', icon: '🍕', msg: `Food costs ${fmt(cats['Food'])} — ${((cats['Food']/income)*100).toFixed(0)}% of income. Try meal prepping!` });
  if (cats['Entertainment'] > income * 0.15 && income > 0) insights.push({ t: 'warn', icon: '🎬', msg: `Entertainment is ${((cats['Entertainment']/income)*100).toFixed(0)}% of income. Consider free alternatives!` });
  if (APP.profile?.monthly_budget > 0 && expense > APP.profile.monthly_budget) insights.push({ t: 'alert', icon: '⛔', msg: `Exceeded monthly budget of ${fmt(APP.profile.monthly_budget)} by ${fmt(expense - APP.profile.monthly_budget)}!` });

  if (insights.length === 0) insights.push({ t: 'good', icon: '✨', msg: 'Everything looks balanced this month. Keep up the great work!' });

  ge('insightsBox').innerHTML = insights.slice(0, 4).map(i => `<div class="insight ${i.t}"><span>${i.icon}</span><span>${i.msg}</span></div>`).join('');
}

// ══════════════════════════════════════════════
//  RENDER TRANSACTION LIST
// ══════════════════════════════════════════════
function getAllTx() {
  const incomes = APP.incomes.map(i => ({ ...i, type: 'income', category: i.source }));
  const expenses = APP.expenses.map(e => ({ ...e, type: 'expense' }));
  return [...incomes, ...expenses].sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.created_at) - new Date(a.created_at));
}

const CAT_ICONS = { Food:'🍕', Rent:'🏠', Travel:'🚌', Shopping:'🛍️', Education:'📚', Health:'💊', Entertainment:'🎬', Other:'📦', Parent:'👨‍👩‍👧', Internship:'💼', Scholarship:'🎓', 'Part-time':'🛠️' };
const CAT_COLORS = { Food:'rgba(245,200,106,0.2)', Rent:'rgba(106,175,245,0.2)', Travel:'rgba(106,245,245,0.15)', Shopping:'rgba(245,106,200,0.18)', Education:'rgba(124,106,245,0.2)', Health:'rgba(106,245,106,0.15)', Entertainment:'rgba(245,106,106,0.18)', Other:'rgba(150,150,200,0.15)', Parent:'rgba(106,245,176,0.2)', Internship:'rgba(245,200,106,0.2)', Scholarship:'rgba(124,106,245,0.2)', 'Part-time':'rgba(245,150,106,0.18)' };

function txItemHTML(t, compact = false) {
  const icon = CAT_ICONS[t.category] || '💳';
  const bg = CAT_COLORS[t.category] || 'rgba(124,106,245,0.15)';
  const amtClass = t.type === 'income' ? 'income' : 'expense';
  const amtSign = t.type === 'income' ? '+' : '-';
  return `<div class="tx-item">
    <div class="tx-icon" style="background:${bg}">${icon}</div>
    <div class="tx-info">
      <div class="tx-name">${t.notes || t.category || t.source || '—'}</div>
      <div class="tx-meta">${t.category || t.source || ''} • ${t.date}</div>
    </div>
    <div class="tx-amount ${amtClass}">${amtSign}${fmt(t.amount)}</div>
    ${!compact ? `<div class="tx-actions">
      <button class="btn btn-ghost btn-icon btn-sm" onclick="openEdit('${t.id}','${t.type}')" title="Edit">✏️</button>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteTransaction('${t.id}','${t.type}')" title="Delete">🗑️</button>
    </div>` : ''}
  </div>`;
}

function renderTxPage() {
  const search = (val('txSearch') || '').toLowerCase();
  const filter = val('txFilter') || 'all';
  const catFilter = val('txCatFilter') || 'all';

  let txs = getAllTx().filter(t => {
    const matchType = filter === 'all' || t.type === filter;
    const matchCat = catFilter === 'all' || t.category === catFilter;
    const matchSearch = !search || (t.category || '').toLowerCase().includes(search) || (t.notes || '').toLowerCase().includes(search);
    return matchType && matchCat && matchSearch;
  });

  // Populate category filter
  const allCats = [...new Set(getAllTx().map(t => t.category).filter(Boolean))];
  const cf = ge('txCatFilter');
  const current = cf.value;
  cf.innerHTML = `<option value="all">All Categories</option>` + allCats.map(c => `<option value="${c}" ${c === current ? 'selected' : ''}>${CAT_ICONS[c] || ''} ${c}</option>`).join('');

  const el = ge('txPageList');
  el.innerHTML = txs.length ? txs.map(t => txItemHTML(t)).join('') :
    `<div class="empty-state"><div>📋</div><h3>No Transactions</h3><p>Use the + button to add one!</p></div>`;
}

function renderIncomePage() {
  const sources = {};
  APP.incomes.forEach(i => { sources[i.source] = (sources[i.source] || 0) + i.amount; });
  const scEl = ge('incomeSourceCards');
  scEl.innerHTML = Object.entries(sources).map(([s, a]) => `
    <div class="stat-card type-balance">
      <div class="stat-label">${s}</div>
      <div class="stat-value">${fmt(a)}</div>
      <div class="stat-sub">Total received</div>
      <div class="stat-icon">${CAT_ICONS[s] || '💰'}</div>
    </div>
  `).join('') || `<div style="grid-column:1/-1;color:var(--text2);padding:20px">No income recorded yet.</div>`;

  const list = ge('incomeList');
  const incTxs = APP.incomes.map(i => ({ ...i, type: 'income', category: i.source }));
  list.innerHTML = incTxs.length ? incTxs.map(t => txItemHTML(t)).join('') :
    `<div class="empty-state"><div>💵</div><h3>No Income Yet</h3><p>Add your first income source.</p></div>`;
}

function renderGoalsPage() {
  const el = ge('goalsContainer');
  if (!APP.goals.length) {
    el.innerHTML = `<div class="empty-state"><div>🎯</div><h3>No Goals Set</h3><p>Set a monthly savings goal to track your progress.</p></div>`;
    return;
  }
  el.innerHTML = APP.goals.map(g => {
    const ym = g.month;
    const income = monthSum(APP.incomes, ym);
    const expense = monthSum(APP.expenses, ym);
    const saved = Math.max(0, income - expense);
    const pct = Math.min(100, (saved / g.target_amount) * 100);
    return `<div class="card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div>
          <div class="section-title" style="margin-bottom:2px">🎯 ${g.title || 'Savings Goal'}</div>
          <div style="font-size:12px;color:var(--text2)">${g.month}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-family:var(--font-h);font-size:18px;font-weight:700">${fmt(saved)} / ${fmt(g.target_amount)}</span>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteGoal('${g.id}')">🗑️</button>
        </div>
      </div>
      <div class="progress-bar" style="height:12px">
        <div class="progress-fill ${pct >= 75 ? 'good' : pct >= 40 ? 'warn' : 'danger'}" style="width:${pct}%"></div>
      </div>
      <div class="progress-meta">
        <span>${pct.toFixed(0)}% saved</span>
        <span>${pct >= 100 ? '🎉 Goal achieved!' : pct >= 50 ? '📈 Halfway there!' : '💪 Keep going!'}</span>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════
//  ANALYTICS
// ══════════════════════════════════════════════
function populateMonthFilter() {
  const sel = ge('analyticsMonth');
  const now = new Date();
  let opts = `<option value="">This Month</option>`;
  for (let i = 1; i <= 11; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = ymStr(d);
    opts += `<option value="${ym}">${d.toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`;
  }
  sel.innerHTML = opts;
}

function updateAnalytics() {
  const selMonth = val('analyticsMonth') || ymStr(new Date());
  const expInMonth = APP.expenses.filter(e => e.date?.startsWith(selMonth));
  const cats = {};
  expInMonth.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount; });

  const COLORS = { Food:'#f5c86a', Rent:'#6aaff5', Travel:'#6af5f5', Shopping:'#f56af5', Education:'#7c6af5', Health:'#6af5b8', Entertainment:'#f56a6a', Other:'#aaaacc' };

  // PIE
  if (pieChart) pieChart.destroy();
  const pCtx = document.getElementById('pieChart');
  if (Object.keys(cats).length) {
    pieChart = new Chart(pCtx, {
      type: 'doughnut',
      data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: Object.keys(cats).map(k => COLORS[k] || '#7c6af5'), borderWidth: 3, borderColor: 'transparent', hoverOffset: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { color: '#7878a8', font: { family: 'DM Sans', size: 12 }, padding: 14 } } } }
    });
  } else {
    const c = pCtx.getContext('2d');
    c.clearRect(0, 0, pCtx.width, pCtx.height);
    c.fillStyle = '#7878a8'; c.font = '14px DM Sans'; c.textAlign = 'center';
    c.fillText('No expense data', pCtx.width / 2, 140);
  }

  // BAR – 6 months
  const now = new Date();
  const labels = [], incData = [], expData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = ymStr(d);
    labels.push(d.toLocaleString('default', { month: 'short' }));
    incData.push(monthSum(APP.incomes, ym));
    expData.push(monthSum(APP.expenses, ym));
  }
  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Income', data: incData, backgroundColor: 'rgba(74,245,176,0.55)', borderColor: '#4af5b0', borderWidth: 1, borderRadius: 6 },
      { label: 'Expenses', data: expData, backgroundColor: 'rgba(245,106,106,0.55)', borderColor: '#f56a6a', borderWidth: 1, borderRadius: 6 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#7878a8', font: { family: 'DM Sans', size: 12 } } } }, scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#7878a8' } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#7878a8', callback: v => `${APP.currency}${v}` } }
    }}
  });

  // BREAKDOWN
  const total = Object.values(cats).reduce((s, v) => s + v, 0) || 1;
  ge('catBreakdown').innerHTML = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div style="width:38px;height:38px;border-radius:10px;background:${(COLORS[cat] || '#7c6af5')}33;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${CAT_ICONS[cat] || '📦'}</div>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
          <span style="font-weight:600;font-size:14px">${cat}</span>
          <span style="font-family:var(--font-m);font-size:13px">${fmt(amt)}</span>
        </div>
        <div class="progress-bar"><div class="progress-fill accent" style="width:${(amt/total*100).toFixed(0)}%;background:${COLORS[cat] || '#7c6af5'}"></div></div>
      </div>
      <span style="font-size:12px;color:var(--text2);width:34px;text-align:right">${(amt/total*100).toFixed(0)}%</span>
    </div>
  `).join('') || `<div class="empty-state sm"><div>📊</div><p>No expense data for this month</p></div>`;
}

// ══════════════════════════════════════════════
//  AI CHATBOT
// ══════════════════════════════════════════════
const CHAT_PROMPTS = {
  finance: `You are a friendly, expert financial coach for students living away from home. Give concise, practical budgeting advice. Keep responses to 3-4 sentences max. Use emojis occasionally. Format money values clearly.`,
  assistant: `You are a data assistant for a student expense tracker app. Answer questions about the student's financial data concisely and helpfully. Use the financial context provided. Keep responses brief.`,
  fun: `You are a fun, upbeat chat buddy for stressed college students. Be supportive, funny, and motivating about student life and money. Keep it short and energetic! Use emojis.`
};

function setChatMode(mode, btn) {
  APP.chatMode = mode;
  APP.chatHistory = [];
  document.querySelectorAll('.mode-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  const intros = {
    finance: '💼 Finance Coach active! Ask me about budgeting, cutting costs, or building savings habits.',
    assistant: `🔍 Data Assistant active! Try: "How much did I spend on food?" or "What's my balance this month?"`,
    fun: '😄 Fun Mode activated! Stressed about money or uni life? I\'m here to hype you up! 🚀'
  };
  ge('chatMessages').innerHTML = '';
  appendChatMsg('ai', intros[mode]);
}

async function sendChat() {
  const input = ge('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  appendChatMsg('user', msg);

  const now = new Date();
  const ym = ymStr(now);
  const income = monthSum(APP.incomes, ym);
  const expense = monthSum(APP.expenses, ym);
  const balance = income - expense;
  const cats = {};
  APP.expenses.filter(e => e.date?.startsWith(ym)).forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount; });
  const context = `Student financial data this month: Income: ${APP.currency}${income.toFixed(2)}, Expenses: ${APP.currency}${expense.toFixed(2)}, Balance: ${APP.currency}${balance.toFixed(2)}, Category breakdown: ${JSON.stringify(cats)}. Monthly budget target: ${APP.currency}${APP.profile?.monthly_budget || 0}`;

  const typId = appendTyping();

  try {
    const apiKey = APP.apiKey || val('apiKeyInput');
    if (!apiKey) throw new Error('No API key');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: CHAT_PROMPTS[APP.chatMode] + '\n\n' + context,
        messages: [...APP.chatHistory.slice(-8), { role: 'user', content: msg }]
      })
    });
    const data = await res.json();
    removeTyping(typId);
    if (data.content?.[0]?.text) {
      const reply = data.content[0].text;
      APP.chatHistory = [...APP.chatHistory, { role: 'user', content: msg }, { role: 'assistant', content: reply }];
      appendChatMsg('ai', reply);
    } else throw new Error('No response');
  } catch {
    removeTyping(typId);
    appendChatMsg('ai', localAIResponse(msg, APP.chatMode, income, expense, balance, cats));
  }
}

function localAIResponse(msg, mode, income, expense, balance, cats) {
  const m = msg.toLowerCase();
  const c = APP.currency;
  const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];

  if (mode === 'assistant') {
    if (m.includes('food')) return `🍕 Food spending this month: ${c}${(cats['Food']||0).toFixed(2)}. ${(cats['Food']||0) > income * 0.3 ? 'That\'s over 30% of income — try cooking at home more!' : 'That looks reasonable!'}`;
    if (m.includes('balance') || m.includes('left')) return `💳 Balance: ${c}${balance.toFixed(2)}. ${balance > 0 ? 'You still have money to work with!' : 'You\'ve overspent this month!'}`;
    if (m.includes('income')) return `💵 Total income this month: ${c}${income.toFixed(2)}`;
    if (m.includes('spend') || m.includes('spent') || m.includes('expense')) return `💸 Total expenses this month: ${c}${expense.toFixed(2)}`;
    if (m.includes('most') || m.includes('top') || m.includes('biggest')) return topCat ? `📊 Biggest spend: ${topCat[0]} at ${c}${topCat[1].toFixed(2)} (${income > 0 ? ((topCat[1]/income)*100).toFixed(0) : '—'}% of income)` : 'No expenses recorded yet!';
    if (m.includes('save') || m.includes('saving')) return `💰 Saved this month: ${c}${Math.max(0, balance).toFixed(2)} out of ${c}${income.toFixed(2)} income (${income > 0 ? ((Math.max(0,balance)/income)*100).toFixed(0) : '0'}%)`;
    return `📋 This month summary — Income: ${c}${income.toFixed(2)}, Expenses: ${c}${expense.toFixed(2)}, Balance: ${c}${balance.toFixed(2)}`;
  }
  if (mode === 'fun') {
    if (m.includes('broke') || m.includes('money') || m.includes('stress')) return `Ugh, money stress is SO real in college 😅 But hey — you're tracking expenses, which puts you miles ahead! One ramen dinner at a time, you've got this! 💪`;
    if (m.includes('motivat') || m.includes('help')) return `You're literally building habits that 90% of adults wish they had started earlier! 🚀 Small consistent savings = HUGE wins down the road. Keep going, financial genius! ⭐`;
    return `Student life hits different 😄 But every ${c} you track is a step toward freedom! You're doing amazing — now go grab some chai and keep hustling! ☕🔥`;
  }
  // Finance coach
  if (m.includes('budget')) return `💼 For your ${c}${income.toFixed(0)} income, try 50/30/20: Needs ${c}${(income*0.5).toFixed(0)}, Wants ${c}${(income*0.3).toFixed(0)}, Savings ${c}${(income*0.2).toFixed(0)}. You're currently spending ${c}${expense.toFixed(2)}.`;
  if (m.includes('save')) return `🎯 To boost savings: 1) Set a specific goal amount, 2) Transfer savings first when money arrives, 3) Review ${topCat ? topCat[0] : 'your biggest'} spending — your top category. ${income > 0 ? `Target saving at least ${c}${(income*0.2).toFixed(0)}/month.` : ''}`;
  if (m.includes('food')) return `🍕 Food is a huge student expense. Batch cook Sunday meals, use student discount apps, and compare canteen vs delivery prices. Could save ${c}${((cats['Food']||0)*0.35).toFixed(0)}/month!`;
  return `💡 This month: Income ${c}${income.toFixed(2)}, Expenses ${c}${expense.toFixed(2)}, Balance ${c}${balance.toFixed(2)}. ${balance >= 0 ? `You're saving ${income > 0 ? ((balance/income)*100).toFixed(0) : 0}% — great!` : `Cut ${c}${(-balance).toFixed(2)} to break even.`} What would you like help with?`;
}

function appendChatMsg(role, text) {
  const msgs = ge('chatMessages');
  const d = document.createElement('div');
  d.className = `chat-msg ${role}`;
  const name = APP.profile?.full_name || 'You';
  d.innerHTML = `<div class="chat-avatar">${role === 'ai' ? '🤖' : name.charAt(0).toUpperCase()}</div><div class="chat-bubble">${text.replace(/\n/g, '<br>')}</div>`;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}

function appendTyping() {
  const msgs = ge('chatMessages');
  const d = document.createElement('div');
  const id = 'typ-' + Date.now();
  d.id = id; d.className = 'chat-msg ai';
  d.innerHTML = `<div class="chat-avatar">🤖</div><div class="chat-bubble"><div class="typing-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return id;
}

function removeTyping(id) { const el = ge(id); if (el) el.remove(); }

// ══════════════════════════════════════════════
//  GAMES
// ══════════════════════════════════════════════
function startGame(name) {
  document.querySelectorAll('[id^="game-"]').forEach(g => g.style.display = 'none');
  ge('game-' + name).style.display = 'block';
  ge('game-' + name).scrollIntoView({ behavior: 'smooth', block: 'start' });
  APP._currentGame = name;
  if (name === 'dodge') initDodge();
  else if (name === 'quiz') initQuiz();
  else if (name === 'reaction') initReaction();
}

function stopGame(name) {
  ge('game-' + name).style.display = 'none';
  clearGameIntervals();
}

function clearGameIntervals() { APP._gameIntervals.forEach(clearInterval); APP._gameIntervals = []; }

async function saveGameScore(gameName, score) {
  // Update local best
  const best = APP.gameScores.filter(s => s.game_name === gameName).reduce((m, s) => Math.max(m, s.score), 0);
  const elId = { dodge: 'dodgeHi', quiz: 'quizHi', reaction: 'reactionHi' }[gameName];
  if (elId) setText(elId, Math.max(best, score));

  if (!APP.user) return;
  await supabase.from('game_scores').insert({ user_id: APP.user.id, game_name: gameName, score });
  await loadGameScores();
  renderLeaderboard();
}

function renderLeaderboard() {
  const el = ge('leaderboard');
  if (!el) return;
  const games = ['dodge', 'quiz', 'reaction'];
  const gNames = { dodge: '🪙 Money Saver', quiz: '🧠 Budget Quiz', reaction: '⚡ Reaction Speed' };
  let html = '';

  games.forEach(g => {
    const scores = APP.gameScores.filter(s => s.game_name === g).sort((a, b) => b.score - a.score).slice(0, 5);
    if (!scores.length) return;
    html += `<div class="lb-game">${gNames[g]}</div>`;
    scores.forEach((s, i) => {
      const cls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-n';
      const uname = APP.profile?.full_name || 'Student';
      html += `<div class="lb-row"><div class="lb-rank ${cls}">${i+1}</div><div style="flex:1;font-weight:500;font-size:14px">${uname}</div><div style="font-family:var(--font-m);font-weight:700;color:var(--accent)">${s.score}</div></div>`;
    });
  });

  el.innerHTML = html || `<div class="empty-state sm"><div>🏆</div><p>Play games to get on the board!</p></div>`;

  // Update hi scores on cards
  games.forEach(g => {
    const hi = APP.gameScores.filter(s => s.game_name === g).reduce((m, s) => Math.max(m, s.score), 0);
    const elId = { dodge: 'dodgeHi', quiz: 'quizHi', reaction: 'reactionHi' }[g];
    if (ge(elId)) setText(elId, hi);
  });
}

// ── DODGE GAME ──────────────────────────────────
function initDodge() {
  const canvas = ge('dodgeCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  clearGameIntervals();
  let score = 0, lives = 3, over = false;
  const player = { x: W / 2, y: H - 60, w: 44, h: 44, spd: 6 };
  let coins = [], hazards = [], keys = {};
  let touchX = null;

  setText('dodgeScore', 0);
  ge('dodgeLives').textContent = '❤️❤️❤️';

  const onKey = e => { keys[e.key] = e.type === 'keydown'; };
  document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);

  canvas.ontouchstart = e => { e.preventDefault(); touchX = e.touches[0].clientX; };
  canvas.ontouchmove = e => { e.preventDefault(); touchX = e.touches[0].clientX; };
  canvas.onclick = e => { const r = canvas.getBoundingClientRect(); touchX = (e.clientX - r.left) * (W / r.width); setTimeout(() => touchX = null, 50); };

  const loop = setInterval(() => {
    if (over) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#12121f'; ctx.fillRect(0, 0, W, H);

    // Grid bg
    ctx.strokeStyle = 'rgba(124,106,245,0.05)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Move player
    if (keys['ArrowLeft'] || keys['a']) player.x = Math.max(player.w / 2, player.x - player.spd);
    if (keys['ArrowRight'] || keys['d']) player.x = Math.min(W - player.w / 2, player.x + player.spd);
    if (touchX !== null) { const rect = canvas.getBoundingClientRect(); const tx = touchX * (W / rect.width); if (Math.abs(tx - player.x) > 5) player.x += (tx - player.x) * 0.14; }

    // Draw player
    ctx.shadowBlur = 15; ctx.shadowColor = '#7c6af5';
    ctx.fillStyle = 'rgba(124,106,245,0.25)'; ctx.beginPath(); ctx.roundRect(player.x - player.w / 2, player.y - player.h / 2, player.w, player.h, 10); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = '28px serif'; ctx.textAlign = 'center'; ctx.fillText('🎓', player.x, player.y + 10);

    // Coins
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i]; c.y += c.spd;
      ctx.shadowBlur = 10; ctx.shadowColor = '#f5c86a';
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(245,200,106,0.3)'; ctx.fill();
      ctx.font = `${c.r * 1.4}px serif`; ctx.textAlign = 'center'; ctx.fillText('💰', c.x, c.y + 6); ctx.shadowBlur = 0;
      if (Math.hypot(c.x - player.x, c.y - player.y) < c.r + 20) { coins.splice(i, 1); score += 10; setText('dodgeScore', score); }
      else if (c.y > H + 20) coins.splice(i, 1);
    }

    // Hazards
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i]; h.y += h.spd;
      ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.fillText('💸', h.x, h.y + 8);
      const px = player.x, py = player.y;
      if (Math.abs(h.x - px) < 26 && Math.abs(h.y - py) < 26) {
        hazards.splice(i, 1); lives = Math.max(0, lives - 1);
        ge('dodgeLives').textContent = '❤️'.repeat(lives) + '🖤'.repeat(3 - lives);
        if (!lives) { over = true; endDodge(ctx, W, H, score); }
      } else if (h.y > H + 30) hazards.splice(i, 1);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '13px JetBrains Mono'; ctx.textAlign = 'left'; ctx.fillText(`Score: ${score}`, 10, 22);
  }, 1000 / 60);

  const coinT = setInterval(() => { if (!over) coins.push({ x: Math.random() * (W - 40) + 20, y: -20, spd: 2 + Math.random() * 2, r: 13 }); }, 1100);
  const hazT = setInterval(() => { if (!over) hazards.push({ x: Math.random() * (W - 40) + 20, y: -30, spd: 2.5 + Math.random() * 2.5 }); }, 850 - Math.min(score, 400));

  APP._gameIntervals = [loop, coinT, hazT];
}

function endDodge(ctx, W, H, score) {
  clearGameIntervals();
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = 'bold 34px Syne'; ctx.fillText('Game Over! 💀', W / 2, 130);
  ctx.font = '20px DM Sans'; ctx.fillText(`Final Score: ${score}`, W / 2, 172);
  ctx.fillStyle = '#7c6af5'; ctx.font = '15px DM Sans'; ctx.fillText('Click to restart', W / 2, 215);
  saveGameScore('dodge', score);
  const canvas = ge('dodgeCanvas');
  canvas.onclick = () => { canvas.onclick = null; initDodge(); };
}

// ── QUIZ GAME ───────────────────────────────────
const QUIZ_Q = [
  { q: "You receive ₹5000 pocket money. What's the BEST first action?", opts: ["Spend on fun weekend", "Put ₹1000 in savings first", "Buy new clothes", "Order food delivery"], c: 1, e: "Pay yourself first! Save 20% immediately before spending." },
  { q: "Your food budget runs out with 10 days left. You should...", opts: ["Use credit card freely", "Skip meals to save money", "Cook cheap rice/pasta meals", "Ask for money immediately"], c: 2, e: "Cook budget meals! Rice, pasta, and lentils are healthy and cheap." },
  { q: "You find a 50% sale on a gaming laptop. You don't need one. Do you buy?", opts: ["Yes! Amazing deal!", "No — a discount on an unnecessary item is still wasted money", "Maybe if you split with friend", "Ask parents' permission"], c: 1, e: "A deal on something you don't need is still unnecessary spending!" },
  { q: "Where should you keep your emergency fund?", opts: ["Invested in crypto", "High-yield savings account", "Under your mattress", "In stocks"], c: 1, e: "Savings account: safe, accessible instantly, earns interest!" },
  { q: "You have ₹500 for the next 10 days. Your daily budget is?", opts: ["₹100/day", "₹50/day", "₹80/day", "₹60/day"], c: 1, e: "₹500 ÷ 10 days = ₹50/day — stick to it strictly!" },
  { q: "Which of these is a NEED (not a want)?", opts: ["Netflix subscription", "Course textbooks", "New sneakers", "Gaming PC"], c: 1, e: "Textbooks are essential for education — a genuine need!" },
  { q: "You owe ₹2000 on credit card. You have ₹3000 spare. What to do?", opts: ["Invest the ₹3000", "Pay off the debt first", "Save all ₹3000", "Spend some, save some"], c: 1, e: "Credit card interest (20-40%) beats any investment return! Pay debt first." },
  { q: "Best way to cut food costs as a student?", opts: ["Buy brand-name food", "Batch meal prep at home", "Order delivery with coupons", "Eat less frequently"], c: 1, e: "Meal prepping saves 60-70% vs eating out every day!" },
  { q: "A friend asks to borrow ₹1000 but often forgets to repay. You...", opts: ["Lend immediately, you're friends", "Only lend what you're okay losing", "Flatly refuse", "Tell your parents"], c: 1, e: "Only lend money you can afford to not get back — protect your budget!" },
  { q: "Which habit builds the most wealth over time?", opts: ["Spending bonuses immediately", "Small consistent savings invested early", "Avoiding all debt forever", "Buying lottery tickets"], c: 1, e: "Compound interest on small consistent savings creates enormous wealth over time!" }
];

let QState = { idx: 0, score: 0, answered: false };

function initQuiz() {
  QState = { idx: 0, score: 0, answered: false };
  setText('quizScore', 0);
  showQuizQ();
}

function showQuizQ() {
  if (QState.idx >= QUIZ_Q.length) { endQuiz(); return; }
  const q = QUIZ_Q[QState.idx];
  setText('quizProg', `${QState.idx + 1}/${QUIZ_Q.length}`);
  setText('quizQ', q.q);
  ge('quizOpts').innerHTML = q.opts.map((o, i) => `<div class="quiz-opt" id="qo${i}" onclick="answerQuiz(${i})">${['🅰️','🅱️','🆎','🆑'][i]} ${o}</div>`).join('');
  QState.answered = false;
}

function answerQuiz(idx) {
  if (QState.answered) return;
  QState.answered = true;
  const q = QUIZ_Q[QState.idx];
  ge('qo' + q.c).classList.add('correct');
  if (idx !== q.c) ge('qo' + idx).classList.add('wrong');
  if (idx === q.c) { QState.score += 10; setText('quizScore', QState.score); toast('✅ Correct! +10 pts', 'success'); }
  else toast(`❌ ${q.e}`, 'error');
  setTimeout(() => { QState.idx++; showQuizQ(); }, 1900);
}

function endQuiz() {
  const pct = QState.score;
  ge('quizContent').innerHTML = `
    <div style="text-align:center;padding:40px 20px">
      <div style="font-size:52px;margin-bottom:16px">${pct >= 80 ? '🏆' : pct >= 50 ? '🎯' : '📚'}</div>
      <div style="font-family:var(--font-h);font-size:40px;font-weight:800;background:linear-gradient(135deg,var(--accent),var(--green));-webkit-background-clip:text;-webkit-text-fill-color:transparent">${pct}/100</div>
      <div style="color:var(--text2);margin:10px 0 24px;font-size:15px">${pct >= 80 ? 'Financial genius! 🌟' : pct >= 50 ? 'Good financial instincts! 👍' : 'Keep learning — every lesson counts! 💪'}</div>
      <button class="btn btn-primary" onclick="initQuiz()">Play Again</button>
    </div>`;
  saveGameScore('quiz', pct);
}

// ── REACTION GAME ───────────────────────────────
let RX = { score: 0, time: 30 };
const RX_ICONS = ['💰','💵','💴','💶','💷','🪙','💲','🤑','💎','🏆'];
const RX_COLORS = ['#f5c86a','#6aaff5','#7c6af5','#6af5b8','#f56a6a'];

function initReaction() {
  clearGameIntervals();
  RX = { score: 0, time: 30 };
  setText('rxScore', 0); setText('rxTime', '30s');
  const area = ge('rxArea'); area.innerHTML = '';

  const spawn = () => {
    const el = document.createElement('div');
    el.className = 'rx-target';
    el.style.left = Math.random() * Math.max(1, area.offsetWidth - 64) + 'px';
    el.style.top = Math.random() * Math.max(1, 240) + 'px';
    el.style.background = RX_COLORS[Math.floor(Math.random() * RX_COLORS.length)];
    el.textContent = RX_ICONS[Math.floor(Math.random() * RX_ICONS.length)];
    el.onclick = () => {
      el.style.transform = 'scale(0)'; el.style.opacity = '0';
      setTimeout(() => el.remove(), 150);
      RX.score += 5; setText('rxScore', RX.score); spawn();
    };
    area.appendChild(el);
    setTimeout(() => { if (el.parentNode) { el.style.opacity = '0'; setTimeout(() => el.parentNode && el.remove(), 200); } }, 1800);
  };

  for (let i = 0; i < 3; i++) spawn();
  const spawnInt = setInterval(spawn, 1300);

  const timer = setInterval(() => {
    RX.time--;
    setText('rxTime', RX.time + 's');
    if (RX.time <= 0) {
      clearInterval(timer); clearInterval(spawnInt); APP._gameIntervals = [];
      area.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:14px">
        <div style="font-size:44px">⏱️</div>
        <div style="font-family:var(--font-h);font-size:32px;font-weight:800;color:var(--accent)">Score: ${RX.score}</div>
        <div style="color:var(--text2);font-size:14px">${RX.score >= 80 ? 'Lightning fast! ⚡' : RX.score >= 40 ? 'Solid reactions! 👍' : 'Keep practicing!'}</div>
        <button class="btn btn-primary" onclick="initReaction()">Play Again</button>
      </div>`;
      saveGameScore('reaction', RX.score);
    }
  }, 1000);

  APP._gameIntervals = [timer, spawnInt];
}

// ══════════════════════════════════════════════
//  SHARE LINK
// ══════════════════════════════════════════════
function generateShareLink() {
  const now = new Date(), ym = ymStr(now);
  const income = monthSum(APP.incomes, ym), expense = monthSum(APP.expenses, ym);
  const data = btoa(JSON.stringify({ n: APP.profile?.full_name || 'Student', i: income.toFixed(0), e: expense.toFixed(0), b: (income - expense).toFixed(0), c: APP.currency, d: now.toLocaleDateString() }));
  const url = window.location.href.split('?')[0] + '?share=' + data;
  set('shareInput', url);
  ge('shareSection').style.display = 'block';
  ge('shareSection').scrollIntoView({ behavior: 'smooth' });
}

function copyShare() { navigator.clipboard.writeText(val('shareInput')); toast('🔗 Link copied!', 'success'); }

// ══════════════════════════════════════════════
//  NAVIGATION & UI HELPERS
// ══════════════════════════════════════════════
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  ge('page-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'analytics') updateAnalytics();
  if (name === 'games') { renderLeaderboard(); }
  if (document.getElementById('sidebar').classList.contains('open')) toggleSidebar();
  window.scrollTo(0, 0);
}

function toggleSidebar() {
  ge('sidebar').classList.toggle('open');
  ge('sideOverlay').classList.toggle('open');
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  ge('themeBtn').textContent = isDark ? '🌞' : '🌙';
  ge('darkSwitch').checked = !isDark;
}

// Modal helpers
function openModal(type = 'expense') { setModalType(type); document.getElementById('addModal').classList.add('open'); ge('txDate').valueAsDate = new Date(); setTimeout(() => ge('txAmt').focus(), 100); }
function closeModal() { document.getElementById('addModal').classList.remove('open'); ge('txAmt').value = ''; ge('txNotes').value = ''; ge('modalError').style.display = 'none'; }
function closeEditModal() { document.getElementById('editModal').classList.remove('open'); }
function openGoalModal() { document.getElementById('goalModal').classList.add('open'); }
function closeGoalModal() { document.getElementById('goalModal').classList.remove('open'); }
function closeConfirm() { document.getElementById('confirmModal').classList.remove('open'); }

function setModalType(type) {
  APP._modalType = type;
  ge('fgCategory').style.display = type === 'expense' ? 'block' : 'none';
  ge('fgSource').style.display = type === 'income' ? 'block' : 'none';
  ge('incTab').classList.toggle('active', type === 'income');
  ge('expTab').classList.toggle('active', type === 'expense');
}

function showModalErr(msg) { const el = ge('modalError'); el.textContent = msg; el.style.display = 'block'; }

// Auth UI helpers
function showLogin() { ge('loginForm').style.display = 'block'; ge('signupForm').style.display = 'none'; ge('resetForm').style.display = 'none'; }
function showSignup() { ge('loginForm').style.display = 'none'; ge('signupForm').style.display = 'block'; ge('resetForm').style.display = 'none'; }
function showReset() { ge('loginForm').style.display = 'none'; ge('signupForm').style.display = 'none'; ge('resetForm').style.display = 'block'; }
function showAuth() { ge('authScreen').style.display = 'flex'; ge('appScreen').style.display = 'none'; ge('fab').style.display = 'none'; }
function showAuthErr(id, msg) { const el = ge(id); el.textContent = msg; el.style.display = 'block'; }
function show(id, msg) { const el = ge(id); el.textContent = msg; el.style.display = 'block'; }

// Toast
function toast(msg, type = 'info', dur = 3000) {
  const t = ge('toast'); t.textContent = msg; t.className = `toast show ${type}`;
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), dur);
}

// Loading state
function setLoading(id, on) { const el = ge(id); if (!el) return; el.disabled = on; el.innerHTML = on ? '<span class="spin">⏳</span> Loading...' : el.dataset.orig || el.textContent; if (!on && el.dataset.orig) el.innerHTML = el.dataset.orig; else el.dataset.orig = el.innerHTML; }

// Utility
const ge = id => document.getElementById(id);
const val = id => { const el = ge(id); return el ? el.value : ''; };
const set = (id, v) => { const el = ge(id); if (el) el.value = v; };
const setText = (id, v) => { const el = ge(id); if (el) el.textContent = v; };
const cur = () => APP.currency || '₹';
const fmt = n => `${cur()}${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ymStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthSum = (arr, ym) => arr.filter(i => i.date?.startsWith(ym)).reduce((s, i) => s + parseFloat(i.amount), 0);

// Keyboard shortcuts
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeEditModal(); closeGoalModal(); closeConfirm(); } });

// Init
window.addEventListener('DOMContentLoaded', init);
