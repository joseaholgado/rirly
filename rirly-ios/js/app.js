"use strict";
/* ============================================================
   app.js · eventos, importar/exportar y arranque
   ============================================================ */

/* ---------- acciones de botones (data-act) ---------- */
const findDay = id => S.cfg.days.find(d => d.id === id);
const draftEntry = exId => { const d = draftOf(UI.dayId); return d && Object.hasOwn(d.entries, exId) ? d.entries[exId] : null; };
const save = () => { persist(); render(); };

const ACTIONS = {
  // semanas y ciclo
  wkprev() { S.cfg.cycleStart = addDays(S.cfg.cycleStart, 7); resetAutoDates(); save(); },
  wknext() { S.cfg.cycleStart = addDays(S.cfg.cycleStart, -7); resetAutoDates(); save(); toast('Semana ' + (curWeek() + 1) + ': sesión reconfigurada'); },
  setwk(t) { S.cfg.cycleStart = addDays(mondayOf(today()), -7 * clamp(+t.dataset.i || 0, 0, S.cfg.weeks - 1)); resetAutoDates(); save(); },
  newcycle() { S.cfg.prevPeak = lastWorkWeek(); S.cfg.cycle++; S.cfg.cycleStart = mondayOf(today()); S.cfg.drafts = {}; UI.tab = 'hoy'; save(); toast(`Ciclo ${S.cfg.cycle} en marcha`); },

  // sesión en curso
  day(t) { UI.dayId = t.dataset.id; render(); },
  done(t) { const ent = draftEntry(t.dataset.ex), st = ent && ent.sets[+t.dataset.i]; if (st) { st.done = !st.done; save(); } },
  alldone(t) { const ent = draftEntry(t.dataset.ex); if (!ent) return; const v = !ent.sets.every(s => s.done); ent.sets.forEach(s => { s.done = v; }); save(); },
  addset(t) {
    const ent = draftEntry(t.dataset.ex); if (!ent) return;
    const prev = ent.sets[ent.sets.length - 1] || {};
    ent.sets.push({ auto: false, kg: prev.kg || '', reps: prev.reps || '', rir: prev.rir || '' }); save();
  },
  rmset(t) { const ent = draftEntry(t.dataset.ex); if (ent && ent.sets.length > 1) { ent.sets.pop(); save(); } },
  savesession() { saveCurrentSession(); },

  // programa
  addday() { S.cfg.days.push(newDay(S.cfg.days.length + 1)); save(); },
  askdelday(t) { UI.confirm = 'day' + t.dataset.d; render(); },
  delday(t) { S.cfg.days = S.cfg.days.filter(d => d.id !== t.dataset.d); delete S.cfg.drafts[t.dataset.d]; UI.confirm = null; save(); },
  addex(t) { const d = findDay(t.dataset.d); if (d) { d.exercises.push(newExercise('Nuevo ejercicio', 3, 8, 10, 2.5, SA)); save(); } },
  askdelex(t) { UI.confirm = 'ex' + t.dataset.e; render(); },
  delex(t) { const d = findDay(t.dataset.d); if (d) { d.exercises = d.exercises.filter(x => x.id !== t.dataset.e); UI.confirm = null; save(); } },
  mv(t) {
    const d = findDay(t.dataset.d); if (!d) return;
    const i = d.exercises.findIndex(x => x.id === t.dataset.e), j = i + +t.dataset.dir;
    if (i >= 0 && j >= 0 && j < d.exercises.length) { [d.exercises[i], d.exercises[j]] = [d.exercises[j], d.exercises[i]]; save(); }
  },

  // historial
  askdelsess(t) { UI.confirm = 's' + t.dataset.id; render(); },
  delsess(t) { S.sessions = S.sessions.filter(s => s.id !== t.dataset.id); UI.confirm = null; saveLocalSessions(); render(); toast('Sesión borrada'); },

  histmetric(t) { if (Object.hasOwn(METRICS, t.dataset.m)) { UI.histMetric = t.dataset.m; render(); } },
  linept(t) {
    const p = Chart.line[+t.dataset.i]; if (!p) return;
    $('#line-cur').setAttribute('x1', p.x); $('#line-cur').setAttribute('x2', p.x);
    $('#line-dot').setAttribute('cx', p.x); $('#line-dot').setAttribute('cy', p.y);
    $('#line-read').textContent = p.text;
  },
  volpt(t) {
    const i = +t.dataset.i; if (!Chart.bars[i]) return;
    document.querySelectorAll('.ch-bar').forEach(b => b.classList.toggle('cur', +b.dataset.bar === i));
    $('#vol-read').textContent = Chart.bars[i];
  },

  // copia de seguridad
  export() {
    const data = backupJson();
    $('#iozone').innerHTML = `<textarea rows="5" readonly class="mono io">${esc(data)}</textarea>`;
    try { navigator.clipboard.writeText(data).then(() => toast('Datos copiados'), () => toast('Copia el texto de abajo')); } catch (err) { toast('Copia el texto de abajo'); }
  },
  showimport() { $('#iozone').innerHTML = `<textarea id="imptxt" rows="5" class="mono io" placeholder="Pega aquí tu copia JSON"></textarea><button class="btn sm pri mt8" data-act="doimport">Restaurar (sustituye lo actual)</button>`; },
  doimport() { const ta = $('#imptxt'); if (ta) stageImport(ta.value); },
  exportfile() { exportFile(); },
  guide() { Guide.start('intro'); },
  impok() { applyImport(); },
  impcancel() { pendingImport = null; closeModal(); }
};

/** Cambia de pestaña; la vista entra por el lado hacia el que se avanza. */
const TAB_ORDER = ['hoy', 'programa', 'bloque', 'historial'];
function goTab(tab) {
  const from = TAB_ORDER.indexOf(UI.tab), to = TAB_ORDER.indexOf(tab), view = $('#view');
  UI.tab = tab; UI.confirm = null; render(); resetScroll();
  if (from === to) return;
  view.classList.remove('slide-next', 'slide-prev');
  void view.offsetWidth; // reinicia la animación si se cambia de pestaña muy rápido
  view.classList.add(to > from ? 'slide-next' : 'slide-prev');
}
$('#view').addEventListener('animationend', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('slide-next', 'slide-prev');
});

document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-act]'); if (!t) return;
  if (t.dataset.tab && !t.dataset.act) { goTab(t.dataset.tab); return; }
  const fn = Object.hasOwn(ACTIONS, t.dataset.act) ? ACTIONS[t.dataset.act] : null;
  if (fn) fn(t);
});

/* ---------- edición en vivo ---------- */
const NUM_FIELDS = { sets: [1, LIMITS.sets], repsMin: [1, LIMITS.reps], repsMax: [1, LIMITS.reps] };
const TEXT_FIELDS = ['name', 'ss', 'seq', 'link', 'notes'];

document.addEventListener('input', e => {
  const t = e.target, ds = t.dataset;
  if (ds.f && ds.ex) {                     // series de la sesión en curso
    const ent = draftEntry(ds.ex), st = ent && ent.sets[+ds.i];
    if (!st || !['kg', 'reps', 'rir'].includes(ds.f)) return;
    st[ds.f] = t.value; st.auto = false; t.classList.remove('auto');
    persist(); updateHint(ds.ex);
  } else if (ds.p) {                       // editor de Programa
    const day = findDay(ds.d); if (!day) return;
    if (ds.p === 'dayname') day.name = t.value.slice(0, 80);
    else if (ds.p === 'daytype') { if (DAY_TYPES.includes(t.value)) day.type = t.value; }
    else {
      const exo = day.exercises.find(x => x.id === ds.e); if (!exo) return;
      if (Object.hasOwn(NUM_FIELDS, ds.p)) {
        const [min, max] = NUM_FIELDS[ds.p], n = parseInt(t.value, 10);
        if (n >= min && n <= max) exo[ds.p] = n;
      } else if (ds.p === 'inc') { if (INCS.includes(+t.value)) exo.inc = +t.value; }
      else if (ds.p === 'kind') { if (KINDS.includes(t.value)) exo.kind = t.value; }
      else if (TEXT_FIELDS.includes(ds.p)) exo[ds.p] = t.value;
    }
    persist();
  } else if (ds.g === 'bodyweight') { S.cfg.bodyweight = t.value.replace(/[^0-9.,]/g, '').slice(0, 6); persist(); }
  else if (ds.g === 'rules') { S.cfg.rules = t.value; persist(); }
  else if (t.id === 'sdate') { const d = draftOf(UI.dayId); if (d && isDate(t.value)) { d.date = t.value; persist(); } }
});

document.addEventListener('change', e => {
  const t = e.target, ds = t.dataset;
  if (ds.act === 'histex') { UI.histEx = t.value; render(); }
  else if (ds.g === 'cycleStart' && isDate(t.value)) { S.cfg.cycleStart = mondayOf(t.value); save(); }
  else if (ds.g === 'weeks') setCycleWeeks(parseInt(t.value, 10));
  else if (ds.g === 'cyclesPlanned') { const n = parseInt(t.value, 10); S.cfg.cyclesPlanned = n >= 1 && n <= CYCLES_MAX ? n : 0; save(); }
  else if (ds.rirw != null) {
    const i = +ds.rirw; if (!(i >= 0 && i < S.cfg.weeks)) return;
    S.cfg.rirPlan[i] = t.value === 'D' ? 'D' : (/^[0-5]$/.test(t.value) ? +t.value : '');
    resetAutoDates(); save();
  }
  else if (t.id === 'sdate') render();
  else if (t.id === 'impfile') importFromFile(t);
  else if (ds.p && Object.hasOwn(NUM_FIELDS, ds.p)) syncNumberFields(ds);
});

/** Cambia la duración del ciclo conservando el RIR ya elegido en las semanas que siguen existiendo. */
function setCycleWeeks(n) {
  if (!(n >= WEEKS_MIN && n <= WEEKS_MAX)) return;
  S.cfg.weeks = n; S.cfg.rirPlan = S.cfg.rirPlan.slice(0, n);
  while (S.cfg.rirPlan.length < n) S.cfg.rirPlan.push('');
  resetAutoDates(); save();
}

/** Al salir de un campo numérico de Programa, deja el formulario igual que lo guardado. */
function syncNumberFields(ds) {
  const day = findDay(ds.d), exo = day && day.exercises.find(x => x.id === ds.e); if (!exo) return;
  if (exo.repsMax < exo.repsMin) exo.repsMax = exo.repsMin;
  Object.keys(NUM_FIELDS).forEach(f => {
    const inp = document.querySelector(`input[data-p="${f}"][data-e="${exo.id}"]`);
    if (inp && inp.value !== String(exo[f])) inp.value = exo[f];
  });
  persist();
}

/* ---------- guardar sesión ---------- */
function saveCurrentSession() {
  const day = findDay(UI.dayId), dr = draftOf(UI.dayId); if (!day || !dr) return;
  const dateEl = $('#sdate'); if (dateEl && isDate(dateEl.value)) dr.date = dateEl.value;
  const sess = buildSession(day, dr);
  if (!sess) { toast('Marca ✓ en las series que hayas hecho'); return; }
  S.sessions.push(sess); delete S.cfg.drafts[day.id];
  saveLocalSessions(); persist(); render(); resetScroll();
  toast('Sesión guardada 💪');
}

/* ---------- exportar ---------- */
const backupJson = () => JSON.stringify({ app: 'rirly', exportedAt: new Date().toISOString(), cfg: S.cfg, sessions: S.sessions });
async function exportFile() {
  const data = backupJson(), name = 'rirly-copia-' + today() + '.json';
  try {
    const file = new File([data], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Copia RIRLY' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- importar ----------
   Dos tipos de archivo:
   · plan  ({kind:'plan', cfg}): sustituye el programa y conserva historial, ciclo, semana y peso corporal.
   · copia ({cfg, sessions}):     sustituye todo. */
let pendingImport = null;

async function importFromFile(input) {
  const f = input.files && input.files[0]; if (!f) return;
  input.value = '';
  if (f.size > LIMITS.importBytes) { toast('Archivo demasiado grande'); return; }
  try { stageImport(await f.text()); } catch (err) { toast('No se pudo leer el archivo'); }
}
function stageImport(txt) {
  let data;
  try { if (typeof txt !== 'string' || txt.length > LIMITS.importBytes) throw 0; data = JSON.parse(txt); } catch (err) { toast('Ese archivo no es una copia válida'); return; }
  const cfg = isObj(data) ? sanitizeCfg(data.cfg) : null;
  if (!cfg) { toast('Ese archivo no es una copia válida'); return; }
  const isPlan = data.kind === 'plan';
  const sessions = isPlan ? null : sanitizeSessions(data.sessions);
  pendingImport = { isPlan, cfg, sessions };
  const wouldLose = S.cfg.days.length > 0 || (!isPlan && S.sessions.length > 0);
  if (!wouldLose) { applyImport(); return; }
  if (isPlan) openModal('Cargar plan', `Sustituye tu programa por el del archivo (${cfg.days.length} días). <b>Tu historial, el ciclo y la semana actual se mantienen.</b>`, 'Cargar');
  else openModal('Restaurar copia', `Sustituye <b>todo</b> lo que hay en este móvil por la copia: ${cfg.days.length} días y ${sessions.length} sesiones.`, 'Restaurar');
}
function applyImport() {
  const p = pendingImport; pendingImport = null; closeModal(); if (!p) return;
  const prev = S.cfg;
  S.cfg = normalize(p.cfg);
  if (p.isPlan) {
    // un plan solo trae el programa: se conserva dónde vas y tus datos
    S.cfg.cycle = prev.cycle; S.cfg.cycleStart = prev.cycleStart;
    S.cfg.weeks = prev.weeks; S.cfg.rirPlan = prev.rirPlan; S.cfg.cyclesPlanned = prev.cyclesPlanned; S.cfg.prevPeak = prev.prevPeak;
    S.cfg.bodyweight = prev.bodyweight || S.cfg.bodyweight;
    S.cfg.drafts = keepDrafts(prev.drafts, S.cfg.days);
  } else {
    S.sessions = p.sessions;
  }
  if (!S.cfg.rules) S.cfg.rules = prev.rules;
  const ok = persist() && saveLocalSessions();
  UI.tab = 'hoy'; render(); resetScroll();
  if (ok) toast(p.isPlan ? 'Plan cargado 💪' : 'Copia restaurada');
}
/** Conserva los borradores de los días y ejercicios que siguen existiendo en el plan nuevo. */
function keepDrafts(drafts, days) {
  const out = {};
  days.forEach(day => {
    if (!Object.hasOwn(drafts, day.id)) return;
    const d = drafts[day.id], entries = {};
    day.exercises.forEach(e => { if (Object.hasOwn(d.entries, e.id)) entries[e.id] = d.entries[e.id]; });
    out[day.id] = { date: d.date, entries };
  });
  return out;
}

/* ---------- arranque ---------- */
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* no disponible */ }
loadFromStorage();
render();
if (!persist()) setStatus('full');
