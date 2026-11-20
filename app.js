/* global firebase, lucide */
(function () {
  'use strict';

  // Your web app's Firebase configuration
  const firebaseConfig = {
    apiKey: 'AIzaSyBQjjCestZlF9tIiA-fujEjeCrJ825HGfo',
    authDomain: 'hostel-diet-tracker.firebaseapp.com',
    projectId: 'hostel-diet-tracker',
    storageBucket: 'hostel-diet-tracker.firebasestorage.app',
    messagingSenderId: '111707725066',
    appId: '1:111707725066:web:0efacf2b9c80e497c16ef3',
    measurementId: 'G-HQR6Y3HN1H'
  };

  // Change this ID if you want separate ledgers for different people/hostels
  const LEDGER_DOC_ID = 'my_hostel_ledger';
  const STORAGE_KEY = 'hostel_diet_tracker_v1';

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Initialize Firebase safely (works with Compat CDN scripts in index.html)
  let ledgerRef = null;
  if (typeof firebase !== 'undefined') {
    try {
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
      if (typeof firebase.analytics === 'function') {
        try {
          firebase.analytics(app);
        } catch (analyticsErr) {
          // Ignore Analytics errors if blocked by browser extensions
        }
      }
      if (typeof firebase.firestore === 'function') {
        const db = firebase.firestore(app);
        ledgerRef = db.collection('hostelDietTracker').doc(LEDGER_DOC_ID);
      }
    } catch (initErr) {
      console.error('Firebase init error:', initErr);
    }
  }

  /** @param {string} id */
  function byId(id) {
    return document.getElementById(id);
  }

  /** @param {string} id @returns {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */
  function fieldById(id) {
    return /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */ (document.getElementById(id));
  }

  /** @param {string} id @returns {HTMLInputElement | null} */
  function checkById(id) {
    return /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  }

  function setSyncBadge(text, isSynced) {
    const badge = byId('syncBadge');
    if (!badge) return;
    badge.textContent = text;
    badge.className = isSynced
      ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700'
      : 'rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600';
  }

  function toDateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function parseDateKey(key) {
    const parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function formatNiceDate(key) {
    const dt = parseDateKey(key);
    return `${DAY_NAMES[dt.getDay()]}, ${dt.getDate()} ${SHORT_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
  }

  const now = new Date();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());

  const state = {
    rates: { simple: 45, special: 75 },
    entries: {}
  };

  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();
  let selectedDateKey = todayKey;
  let exportMode = 'month';
  let cloudSaveTimer = null;
  let toastTimer = null;

  function applyLoadedData(parsed) {
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.rates) {
      state.rates.simple = Number(parsed.rates.simple) >= 0 ? Number(parsed.rates.simple) : 45;
      state.rates.special = Number(parsed.rates.special) >= 0 ? Number(parsed.rates.special) : 75;
    }
    if (parsed.entries && typeof parsed.entries === 'object') {
      state.entries = parsed.entries;
    }
  }

  function loadLocalState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) applyLoadedData(JSON.parse(raw));
    } catch (e) {
      // Ignore storage errors
    }
  }

  function loadCloudState() {
    if (!ledgerRef) {
      setSyncBadge('Local Storage', false);
      return;
    }
    setSyncBadge('Syncing...', false);
    ledgerRef.get()
      .then((snap) => {
        if (snap.exists) {
          applyLoadedData(snap.data());
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          } catch (e) {
            // Ignore storage errors
          }
          renderAll();
        } else if (Object.keys(state.entries).length > 0) {
          return ledgerRef.set(state);
        }
        return null;
      })
      .then(() => {
        setSyncBadge('Firebase Synced', true);
      })
      .catch((err) => {
        console.error('Firebase load error:', err);
        setSyncBadge('Offline (Local)', false);
      });
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Ignore storage errors
    }

    if (!ledgerRef) return;
    setSyncBadge('Saving...', false);
    if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => {
      ledgerRef.set(state)
        .then(() => {
          setSyncBadge('Firebase Synced', true);
        })
        .catch((err) => {
          console.error('Firebase save error:', err);
          setSyncBadge('Sync Error (Local)', false);
        });
    }, 400);
  }

  function normalizeEntry(raw) {
    if (!raw) return { lunch: 'none', night: 'none', snacks: [] };
    if (raw.lunch !== undefined || raw.night !== undefined) {
      return {
        lunch: raw.lunch || 'none',
        night: raw.night || 'none',
        snacks: Array.isArray(raw.snacks) ? raw.snacks : []
      };
    }
    const meals = [];
    for (let i = 0; i < (raw.special || 0) && meals.length < 2; i++) meals.push('special');
    for (let i = 0; i < (raw.simple || 0) && meals.length < 2; i++) meals.push('simple');
    return {
      lunch: meals[0] || 'none',
      night: meals[1] || 'none',
      snacks: Array.isArray(raw.snacks) ? raw.snacks : []
    };
  }

  function getEntry(key) {
    return normalizeEntry(state.entries[key]);
  }

  function ensureEntry(key) {
    state.entries[key] = normalizeEntry(state.entries[key]);
    return state.entries[key];
  }

  function getDietCounts(entry) {
    let simple = 0;
    let special = 0;
    [entry.lunch, entry.night].forEach((m) => {
      if (m === 'simple') simple++;
      if (m === 'special') special++;
    });
    return { simple, special };
  }

  function cleanupEntryIfEmpty(key) {
    const entry = state.entries[key];
    if (!entry) return;
    if (entry.lunch === 'none' && entry.night === 'none' && (!entry.snacks || entry.snacks.length === 0)) {
      delete state.entries[key];
    }
  }

  function showToast(msg) {
    const toast = byId('toast');
    const toastText = byId('toastText');
    if (!toast || !toastText) return;
    toastText.textContent = msg;
    toast.classList.remove('hidden');
    toast.classList.add('flex');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
      toast.classList.remove('flex');
    }, 2000);
  }

  function populateDropdowns() {
    const monthSel = fieldById('monthSelect');
    const yearSel = fieldById('yearSelect');
    const expMonthSel = fieldById('exportMonthSelect');
    const expYearSel = fieldById('exportYearSelect');
    if (!monthSel || !yearSel || !expMonthSel || !expYearSel) return;

    monthSel.innerHTML = '';
    expMonthSel.innerHTML = '';
    MONTH_NAMES.forEach((name, idx) => {
      monthSel.appendChild(new Option(name, String(idx)));
      expMonthSel.appendChild(new Option(name, String(idx)));
    });

    yearSel.innerHTML = '';
    expYearSel.innerHTML = '';
    const baseYear = now.getFullYear();
    for (let y = baseYear - 5; y <= baseYear + 5; y++) {
      yearSel.appendChild(new Option(String(y), String(y)));
      expYearSel.appendChild(new Option(String(y), String(y)));
    }
  }

  function renderCalendar() {
    const monthSel = fieldById('monthSelect');
    const yearSel = fieldById('yearSelect');
    const grid = byId('calendarGrid');
    if (!monthSel || !yearSel || !grid) return;

    monthSel.value = String(viewMonth);
    yearSel.value = String(viewYear);
    grid.innerHTML = '';

    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < firstDayOfWeek; i++) {
      const blank = document.createElement('div');
      blank.className = 'cal-cell rounded-xl bg-slate-50/60 border border-transparent';
      grid.appendChild(blank);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const key = toDateKey(viewYear, viewMonth, d);
      const entry = getEntry(key);
      const snackSum = (entry.snacks || []).reduce((acc, s) => acc + Number(s.amount || 0), 0);
      const isSelected = key === selectedDateKey;
      const isToday = key === todayKey;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.dateKey = key;

      let classes = 'cal-cell flex flex-col items-start justify-between rounded-xl border p-1.5 text-left transition cursor-pointer ';
      if (isSelected) {
        classes += 'border-slate-900 bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/15';
      } else if (isToday) {
        classes += 'border-emerald-400 bg-emerald-50/40 text-slate-900 hover:border-emerald-500';
      } else {
        classes += 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50';
      }
      btn.className = classes;

      const topRow = document.createElement('div');
      topRow.className = 'flex w-full items-center justify-between';

      const numSpan = document.createElement('span');
      numSpan.className = `text-xs font-bold ${isSelected ? 'text-white' : isToday ? 'text-emerald-700' : 'text-slate-700'}`;
      numSpan.textContent = String(d);
      topRow.appendChild(numSpan);

      if (isToday && !isSelected) {
        const dot = document.createElement('span');
        dot.className = 'h-1.5 w-1.5 rounded-full bg-emerald-500';
        topRow.appendChild(dot);
      }

      btn.appendChild(topRow);

      const badges = document.createElement('div');
      badges.className = 'mt-1 flex w-full flex-wrap gap-1';

      const counts = getDietCounts(entry);
      if (counts.simple > 0) {
        const b = document.createElement('span');
        b.className = `rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${isSelected ? 'bg-emerald-500/30 text-emerald-200' : 'bg-emerald-100 text-emerald-800'}`;
        b.textContent = `S:${counts.simple}`;
        badges.appendChild(b);
      }

      if (counts.special > 0) {
        const b = document.createElement('span');
        b.className = `rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${isSelected ? 'bg-amber-500/30 text-amber-200' : 'bg-amber-100 text-amber-800'}`;
        b.textContent = `Sp:${counts.special}`;
        badges.appendChild(b);
      }

      if (snackSum > 0) {
        const b = document.createElement('span');
        b.className = `rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${isSelected ? 'bg-indigo-500/35 text-indigo-200' : 'bg-indigo-100 text-indigo-800'}`;
        b.textContent = `₹${snackSum}`;
        badges.appendChild(b);
      }

      btn.appendChild(badges);
      btn.addEventListener('click', () => {
        selectedDateKey = key;
        renderAll();
      });

      grid.appendChild(btn);
    }
  }

  function renderMonthlyKPIs() {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    let simpleTotal = 0;
    let specialTotal = 0;
    let snacksTotal = 0;
    let snackEntriesCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const key = toDateKey(viewYear, viewMonth, d);
      const entry = getEntry(key);
      const counts = getDietCounts(entry);
      simpleTotal += counts.simple;
      specialTotal += counts.special;
      const snacks = entry.snacks || [];
      snackEntriesCount += snacks.length;
      snacksTotal += snacks.reduce((sum, s) => sum + Number(s.amount || 0), 0);
    }

    const dietCost = (simpleTotal * state.rates.simple) + (specialTotal * state.rates.special);
    const grandTotal = dietCost + snacksTotal;

    const setText = (id, val) => {
      const el = byId(id);
      if (el) el.textContent = String(val);
    };

    setText('kpiMonthLabel', `${SHORT_MONTHS[viewMonth]} ${viewYear}`);
    setText('kpiTotalDiets', simpleTotal + specialTotal);
    setText('kpiSimpleCount', simpleTotal);
    setText('kpiSpecialCount', specialTotal);
    setText('kpiDietCost', `₹${dietCost.toLocaleString('en-IN')}`);
    setText('kpiRatesHint', `₹${state.rates.simple} Simple / ₹${state.rates.special} Special`);
    setText('kpiSnacksCost', `₹${snacksTotal.toLocaleString('en-IN')}`);
    setText('kpiSnackEntries', snackEntriesCount);
    setText('kpiGrandTotal', `₹${grandTotal.toLocaleString('en-IN')}`);
  }

  function renderDayEditor() {
    const entry = getEntry(selectedDateKey);
    const titleEl = byId('selectedDateTitle');
    if (titleEl) titleEl.textContent = formatNiceDate(selectedDateKey);

    const todayBadge = byId('todayBadge');
    if (todayBadge) todayBadge.classList.toggle('hidden', selectedDateKey !== todayKey);

    const isWednesday = parseDateKey(selectedDateKey).getDay() === 3;

    const inlineSimpleEl = fieldById('inlineSimpleRate');
    const inlineSpecialEl = fieldById('inlineSpecialRate');
    if (inlineSimpleEl && document.activeElement !== inlineSimpleEl) {
      inlineSimpleEl.value = String(state.rates.simple);
    }
    if (inlineSpecialEl && document.activeElement !== inlineSpecialEl) {
      inlineSpecialEl.value = String(state.rates.special);
    }

    function styleMealCard(prefix, value) {
      const card = byId(`${prefix}Card`);
      const statusEl = byId(`${prefix}StatusText`);
      const wedBadge = byId(`${prefix}WedBadge`);
      const noneBtn = byId(`${prefix}NoneBtn`);
      const simpleBtn = byId(`${prefix}SimpleBtn`);
      const specialBtn = byId(`${prefix}SpecialBtn`);
      if (!card || !statusEl || !wedBadge || !noneBtn || !simpleBtn || !specialBtn) return;

      wedBadge.classList.toggle('hidden', !isWednesday);
      specialBtn.classList.toggle('hidden', !isWednesday);

      const baseBtn = 'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ';
      noneBtn.className = baseBtn + (value === 'none'
        ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100');
      simpleBtn.className = baseBtn + (value === 'simple'
        ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
        : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50');
      specialBtn.className = (isWednesday ? '' : 'hidden ') + baseBtn + (value === 'special'
        ? 'border-amber-500 bg-amber-500 text-white shadow-xs'
        : 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50');

      if (value === 'simple') {
        card.className = 'rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 transition';
        statusEl.textContent = `Simple Diet • ₹${state.rates.simple}`;
      } else if (value === 'special') {
        card.className = 'rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 transition';
        statusEl.textContent = `Special Diet • ₹${state.rates.special}`;
      } else {
        card.className = 'rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 transition';
        statusEl.textContent = 'Not taken • ₹0';
      }
    }

    styleMealCard('lunch', entry.lunch);
    styleMealCard('night', entry.night);

    const counts = getDietCounts(entry);
    const simpleSub = counts.simple * state.rates.simple;
    const specialSub = counts.special * state.rates.special;

    const countSummaryEl = byId('dayDietCountSummary');
    const dietsSubEl = byId('dayDietsSubtotal');
    if (countSummaryEl) countSummaryEl.textContent = `${counts.simple + counts.special} / 2`;
    if (dietsSubEl) dietsSubEl.textContent = `₹${(simpleSub + specialSub).toLocaleString('en-IN')}`;

    const snacks = entry.snacks || [];
    const snacksTotal = snacks.reduce((sum, s) => sum + Number(s.amount || 0), 0);
    const daySnacksTotalEl = byId('daySnacksTotal');
    if (daySnacksTotalEl) daySnacksTotalEl.textContent = `₹${snacksTotal.toLocaleString('en-IN')}`;

    const snackListEl = byId('daySnackList');
    if (snackListEl) {
      snackListEl.innerHTML = '';
      if (snacks.length === 0) {
        const emptyP = document.createElement('p');
        emptyP.className = 'text-xs text-slate-400 italic py-1';
        emptyP.textContent = 'No snacks logged for this day.';
        snackListEl.appendChild(emptyP);
      } else {
        snacks.forEach((s) => {
          const row = document.createElement('div');
          row.className = 'flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs border border-indigo-100';

          const left = document.createElement('div');
          left.className = 'flex items-center gap-2 min-w-0';

          const amt = document.createElement('span');
          amt.className = 'font-bold text-indigo-700 shrink-0';
          amt.textContent = `₹${s.amount}`;

          const note = document.createElement('span');
          note.className = 'truncate text-slate-600';
          note.textContent = s.note || 'Snack';

          left.appendChild(amt);
          left.appendChild(note);

          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.setAttribute('aria-label', 'Remove snack entry');
          delBtn.className = 'rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition shrink-0';
          delBtn.innerHTML = '&times;';
          delBtn.addEventListener('click', () => {
            const e = ensureEntry(selectedDateKey);
            e.snacks = e.snacks.filter((item) => item.id !== s.id);
            cleanupEntryIfEmpty(selectedDateKey);
            saveState();
            renderAll();
          });

          row.appendChild(left);
          row.appendChild(delBtn);
          snackListEl.appendChild(row);
        });
      }
    }

    const dayGrandTotalEl = byId('dayGrandTotal');
    if (dayGrandTotalEl) {
      dayGrandTotalEl.textContent = `₹${(simpleSub + specialSub + snacksTotal).toLocaleString('en-IN')}`;
    }
  }

  function renderAll() {
    renderMonthlyKPIs();
    renderCalendar();
    renderDayEditor();
  }

  function setMeal(mealSlot, dietType) {
    if (dietType === 'special' && parseDateKey(selectedDateKey).getDay() !== 3) return;
    const entry = ensureEntry(selectedDateKey);
    entry[mealSlot] = dietType;
    cleanupEntryIfEmpty(selectedDateKey);
    saveState();
    renderAll();
  }

  function addSnack(amount, note) {
    const val = Number(amount);
    if (!val || val <= 0) return;
    const entry = ensureEntry(selectedDateKey);
    entry.snacks = entry.snacks || [];
    entry.snacks.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      amount: Math.round(val),
      note: (note || '').trim() || 'Snacks'
    });
    saveState();
    renderAll();
    showToast(`Added ₹${Math.round(val)} snack`);
  }

  function buildTxtReport() {
    const emptyBox = checkById('includeEmptyDaysCheckbox');
    const includeEmpty = emptyBox ? emptyBox.checked : false;
    let startDt;
    let endDt;
    let periodTitle;

    if (exportMode === 'month') {
      const mEl = fieldById('exportMonthSelect');
      const yEl = fieldById('exportYearSelect');
      const m = mEl ? Number(mEl.value) : viewMonth;
      const y = yEl ? Number(yEl.value) : viewYear;
      startDt = new Date(y, m, 1);
      endDt = new Date(y, m, new Date(y, m + 1, 0).getDate());
      periodTitle = `${MONTH_NAMES[m]} ${y}`;
    } else {
      const sEl = fieldById('exportStartDate');
      const eEl = fieldById('exportEndDate');
      const sVal = sEl ? sEl.value : '';
      const eVal = eEl ? eEl.value : '';
      if (!sVal || !eVal) return 'Please select both From Date and To Date.';
      startDt = parseDateKey(sVal);
      endDt = parseDateKey(eVal);
      if (startDt > endDt) return 'Error: "From Date" cannot be after "To Date".';
      periodTitle = `${sVal} to ${eVal}`;
    }

    const lines = [
      '============================================================',
      '              HOSTEL DIET & SNACK EXPENSE REPORT            ',
      '============================================================',
      `Period       : ${periodTitle}`,
      `Diet Rates   : Simple = Rs.${state.rates.simple} | Special = Rs.${state.rates.special}`,
      `Generated On : ${new Date().toLocaleString()}`,
      '__TOP_TOTAL_PLACEHOLDER__',
      '------------------------------------------------------------',
      'Date        | Day | Lunch   | Night   | Snacks (Rs) | Total',
      '------------------------------------------------------------'
    ];

    let totalSimple = 0;
    let totalSpecial = 0;
    let totalSnacks = 0;
    let activeDays = 0;

    const cursor = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate());
    while (cursor <= endDt) {
      const key = toDateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      const entry = getEntry(key);
      const counts = getDietCounts(entry);
      const sCount = counts.simple;
      const spCount = counts.special;
      const snacks = entry.snacks || [];
      const snackSum = snacks.reduce((acc, item) => acc + Number(item.amount || 0), 0);
      const dayCost = (sCount * state.rates.simple) + (spCount * state.rates.special) + snackSum;

      totalSimple += sCount;
      totalSpecial += spCount;
      totalSnacks += snackSum;

      const hasActivity = sCount > 0 || spCount > 0 || snackSum > 0;
      if (hasActivity) activeDays++;

      if (hasActivity || includeEmpty) {
        const dayShort = DAY_NAMES[cursor.getDay()].slice(0, 3);
        const fmtMeal = (val) => (val === 'simple' ? 'Simple ' : val === 'special' ? 'Special' : '-      ');
        lines.push(
          `${key}  | ${dayShort} | ${fmtMeal(entry.lunch)} | ${fmtMeal(entry.night)} | ` +
          `Rs.${String(snackSum).padStart(7, ' ')} | Rs.${dayCost}`
        );
        if (snacks.length > 0) {
          lines.push(`   -> Snacks: ${snacks.map((x) => `${x.note} (Rs.${x.amount})`).join(', ')}`);
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (activeDays === 0 && !includeEmpty) {
      lines.push('  (No diets or snacks recorded in this period)');
    }

    const totalSimpleCost = totalSimple * state.rates.simple;
    const totalSpecialCost = totalSpecial * state.rates.special;
    const totalDietCost = totalSimpleCost + totalSpecialCost;
    const grandTotal = totalDietCost + totalSnacks;

    lines.push(
      '============================================================',
      'SUMMARY',
      '------------------------------------------------------------',
      `Active Days          : ${activeDays}`,
      `Simple Diets Taken   : ${totalSimple}  (Rs.${totalSimpleCost})`,
      `Special Diets Taken  : ${totalSpecial}  (Rs.${totalSpecialCost})`,
      `Total Diets Taken    : ${totalSimple + totalSpecial}  (Rs.${totalDietCost})`,
      `Total Snacks Spent   : Rs.${totalSnacks}`,
      '------------------------------------------------------------',
      `TOTAL AMOUNT         : Rs.${grandTotal}`,
      '============================================================'
    );

    const topIdx = lines.indexOf('__TOP_TOTAL_PLACEHOLDER__');
    if (topIdx !== -1) {
      lines[topIdx] = `TOTAL AMOUNT : Rs.${grandTotal} (Diets: Rs.${totalDietCost} + Snacks: Rs.${totalSnacks})`;
    }

    return lines.join('\n');
  }

  function refreshExportPreview() {
    const txt = buildTxtReport();
    const previewEl = fieldById('txtPreview');
    const countEl = byId('exportLineCount');
    if (previewEl) previewEl.value = txt;
    if (countEl) countEl.textContent = `${txt.split('\n').length} lines`;
  }

  function onClick(id, handler) {
    const el = byId(id);
    if (el) el.addEventListener('click', handler);
  }

  // Event Listeners
  onClick('prevMonthBtn', () => {
    viewMonth--;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear--;
    }
    renderAll();
  });

  onClick('nextMonthBtn', () => {
    viewMonth++;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear++;
    }
    renderAll();
  });

  onClick('todayBtn', () => {
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    selectedDateKey = todayKey;
    renderAll();
  });

  const monthSelectEl = fieldById('monthSelect');
  if (monthSelectEl) {
    monthSelectEl.addEventListener('change', () => {
      viewMonth = Number(monthSelectEl.value);
      renderAll();
    });
  }

  const yearSelectEl = fieldById('yearSelect');
  if (yearSelectEl) {
    yearSelectEl.addEventListener('change', () => {
      viewYear = Number(yearSelectEl.value);
      renderAll();
    });
  }

  onClick('lunchNoneBtn', () => setMeal('lunch', 'none'));
  onClick('lunchSimpleBtn', () => setMeal('lunch', 'simple'));
  onClick('lunchSpecialBtn', () => setMeal('lunch', 'special'));
  onClick('nightNoneBtn', () => setMeal('night', 'none'));
  onClick('nightSimpleBtn', () => setMeal('night', 'simple'));
  onClick('nightSpecialBtn', () => setMeal('night', 'special'));

  const inlineSimpleInput = fieldById('inlineSimpleRate');
  if (inlineSimpleInput) {
    inlineSimpleInput.addEventListener('input', () => {
      state.rates.simple = Math.max(0, Number(inlineSimpleInput.value) || 0);
      saveState();
      renderAll();
    });
  }

  const inlineSpecialInput = fieldById('inlineSpecialRate');
  if (inlineSpecialInput) {
    inlineSpecialInput.addEventListener('input', () => {
      state.rates.special = Math.max(0, Number(inlineSpecialInput.value) || 0);
      saveState();
      renderAll();
    });
  }

  document.querySelectorAll('.quick-snack-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const amt = Number(btn.getAttribute('data-quick-snack'));
      addSnack(amt, 'Snacks');
    });
  });

  const snackForm = byId('snackForm');
  if (snackForm) {
    snackForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const amtEl = fieldById('snackAmountInput');
      const noteEl = fieldById('snackNoteInput');
      if (!amtEl || !noteEl) return;
      addSnack(amtEl.value, noteEl.value);
      amtEl.value = '';
      noteEl.value = '';
    });
  }

  onClick('clearDayBtn', () => {
    if (state.entries[selectedDateKey]) {
      delete state.entries[selectedDateKey];
      saveState();
      renderAll();
      showToast('Cleared selected day');
    }
  });

  // Export Modal
  const exportModal = byId('exportModal');
  onClick('openExportBtn', () => {
    const expM = fieldById('exportMonthSelect');
    const expY = fieldById('exportYearSelect');
    const expStart = fieldById('exportStartDate');
    const expEnd = fieldById('exportEndDate');
    const daysInM = new Date(viewYear, viewMonth + 1, 0).getDate();
    if (expM) expM.value = String(viewMonth);
    if (expY) expY.value = String(viewYear);
    if (expStart) expStart.value = toDateKey(viewYear, viewMonth, 1);
    if (expEnd) expEnd.value = toDateKey(viewYear, viewMonth, daysInM);
    refreshExportPreview();
    if (exportModal) {
      exportModal.classList.remove('hidden');
      exportModal.classList.add('flex');
    }
  });

  onClick('closeExportBtn', () => {
    if (exportModal) {
      exportModal.classList.add('hidden');
      exportModal.classList.remove('flex');
    }
  });

  onClick('modeMonthBtn', () => {
    exportMode = 'month';
    const mBtn = byId('modeMonthBtn');
    const rBtn = byId('modeRangeBtn');
    const mCtrl = byId('exportMonthControls');
    const rCtrl = byId('exportRangeControls');
    if (mBtn) mBtn.className = 'flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-slate-900 shadow-sm transition';
    if (rBtn) rBtn.className = 'flex-1 rounded-lg py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition';
    if (mCtrl) { mCtrl.classList.remove('hidden'); mCtrl.classList.add('grid'); }
    if (rCtrl) { rCtrl.classList.add('hidden'); rCtrl.classList.remove('grid'); }
    refreshExportPreview();
  });

  onClick('modeRangeBtn', () => {
    exportMode = 'range';
    const mBtn = byId('modeMonthBtn');
    const rBtn = byId('modeRangeBtn');
    const mCtrl = byId('exportMonthControls');
    const rCtrl = byId('exportRangeControls');
    if (rBtn) rBtn.className = 'flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-slate-900 shadow-sm transition';
    if (mBtn) mBtn.className = 'flex-1 rounded-lg py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition';
    if (rCtrl) { rCtrl.classList.remove('hidden'); rCtrl.classList.add('grid'); }
    if (mCtrl) { mCtrl.classList.add('hidden'); mCtrl.classList.remove('grid'); }
    refreshExportPreview();
  });

  ['exportMonthSelect', 'exportYearSelect', 'exportStartDate', 'exportEndDate', 'includeEmptyDaysCheckbox'].forEach((id) => {
    const el = byId(id);
    if (el) el.addEventListener('change', refreshExportPreview);
  });

  onClick('copyTxtBtn', () => {
    const preview = fieldById('txtPreview');
    if (!preview) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(preview.value)
        .then(() => showToast('Copied TXT report'))
        .catch(() => {
          preview.select();
          document.execCommand('copy');
          showToast('Copied TXT report');
        });
    } else {
      preview.select();
      document.execCommand('copy');
      showToast('Copied TXT report');
    }
  });

  onClick('downloadTxtBtn', () => {
    const preview = fieldById('txtPreview');
    if (!preview) return;
    const txt = preview.value;
    let filename = 'hostel_diet_report.txt';
    if (exportMode === 'month') {
      const mEl = fieldById('exportMonthSelect');
      const yEl = fieldById('exportYearSelect');
      const m = mEl ? Number(mEl.value) : viewMonth;
      const y = yEl ? Number(yEl.value) : viewYear;
      filename = `hostel_diets_${SHORT_MONTHS[m]}_${y}.txt`;
    } else {
      const sEl = fieldById('exportStartDate');
      const eEl = fieldById('exportEndDate');
      const s = (sEl && sEl.value) ? sEl.value : 'start';
      const e = (eEl && eEl.value) ? eEl.value : 'end';
      filename = `hostel_diets_${s}_to_${e}.txt`;
    }
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename}`);
  });

  // Rates Modal
  const ratesModal = byId('ratesModal');
  onClick('openRatesBtn', () => {
    const sIn = fieldById('simpleRateInput');
    const spIn = fieldById('specialRateInput');
    const resetBox = byId('resetConfirmBox');
    if (sIn) sIn.value = String(state.rates.simple);
    if (spIn) spIn.value = String(state.rates.special);
    if (resetBox) resetBox.classList.add('hidden');
    if (ratesModal) {
      ratesModal.classList.remove('hidden');
      ratesModal.classList.add('flex');
    }
  });

  onClick('closeRatesBtn', () => {
    if (ratesModal) {
      ratesModal.classList.add('hidden');
      ratesModal.classList.remove('flex');
    }
  });

  const ratesForm = byId('ratesForm');
  if (ratesForm) {
    ratesForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const sIn = fieldById('simpleRateInput');
      const spIn = fieldById('specialRateInput');
      if (sIn) state.rates.simple = Math.max(0, Number(sIn.value) || 0);
      if (spIn) state.rates.special = Math.max(0, Number(spIn.value) || 0);
      saveState();
      renderAll();
      if (ratesModal) {
        ratesModal.classList.add('hidden');
        ratesModal.classList.remove('flex');
      }
      showToast('Updated diet rates');
    });
  }

  onClick('resetAllBtn', () => {
    const resetBox = byId('resetConfirmBox');
    if (resetBox) resetBox.classList.remove('hidden');
  });

  onClick('cancelResetBtn', () => {
    const resetBox = byId('resetConfirmBox');
    if (resetBox) resetBox.classList.add('hidden');
  });

  onClick('confirmResetBtn', () => {
    state.entries = {};
    saveState();
    renderAll();
    if (ratesModal) {
      ratesModal.classList.add('hidden');
      ratesModal.classList.remove('flex');
    }
    showToast('All data cleared');
  });

  // Initialize
  loadLocalState();
  populateDropdowns();
  renderAll();
  loadCloudState();
  if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }
})();
