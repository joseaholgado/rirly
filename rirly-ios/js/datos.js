"use strict";
/* ============================================================
   datos.js · estado, constantes, saneado y almacenamiento
   Todo lo que entra de un archivo o de localStorage pasa por
   sanitizeCfg / sanitizeSessions antes de usarse.
   ============================================================ */

/* ---------- constantes del programa ---------- */
const VERSION = 3;
// RIR por semana (S1…S8). D = descarga.
const SA = '3·3·2·2·2·1·1·D';
const SC = '3·3·3·2·2·2·2·D';
const PHASES = ['Adaptación', 'Adaptación', 'Acumulación', 'Acumulación', 'Intensificación', 'Intensificación', 'Pico', 'Descarga'];
const WEEKS_DEFAULT = PHASES.length, WEEKS_MIN = 2, WEEKS_MAX = 16, CYCLES_MAX = 99;
// Grupos musculares de cada ejercicio. La zona decide el calentamiento y la subida de carga por ciclo.
const MUSCLE_GROUPS = [
  ['Tren superior', [['pecho', 'Pecho'], ['espalda', 'Espalda'], ['hombro', 'Hombro'], ['biceps', 'Bíceps'], ['triceps', 'Tríceps'], ['antebrazo', 'Antebrazo'], ['core', 'Core']]],
  ['Tren inferior', [['cuadriceps', 'Cuádriceps'], ['femoral', 'Femoral'], ['gluteo', 'Glúteo'], ['gemelo', 'Gemelo']]]
];
const MUSCLES = MUSCLE_GROUPS.flatMap(g => g[1].map(x => x[0]));
const MUSCLE_LABEL = Object.fromEntries(MUSCLE_GROUPS.flatMap(g => g[1]));
const DAY_TYPES = ['torso', 'pierna', ...MUSCLES];   // los días antiguos pueden traer cualquiera de estos
const LOWER_TYPES = ['pierna', 'cuadriceps', 'femoral', 'gluteo', 'gemelo'];
const regionOf = type => LOWER_TYPES.includes(type) ? 'pierna' : 'torso';
// Propuesta por nombre: gana la primera regla que encaje, así que las más concretas van antes.
const MUSCLE_RULES = [
  [/fondos? (en |de )?banco/, 'triceps', ['pecho', 'hombro']],
  [/fondo/, 'pecho', ['triceps', 'hombro']],
  [/press (de )?pierna|prensa|sentadilla|squat|zancada|bulgara|hack|extension(es)? (de )?(cuadriceps|pierna)|cuadriceps/, 'cuadriceps', ['gluteo']],
  [/hip thrust|empuje de cadera|puente de gluteo|gluteo/, 'gluteo', ['femoral']],
  [/curl (de )?femoral|curl (de )?pierna|femoral|isquio|nordic/, 'femoral', []],
  [/rumano|buenos dias/, 'femoral', ['gluteo', 'espalda']],
  [/peso muerto/, 'espalda', ['gluteo', 'femoral', 'antebrazo']],
  [/gemelo|talon|pantorrilla/, 'gemelo', []],
  [/press frances|triceps|rompecraneos|skull/, 'triceps', []],
  [/curl (de )?(muneca|antebrazo)|antebrazo|muneca|farmer|paseo del granjero/, 'antebrazo', []],
  [/curl|biceps/, 'biceps', ['antebrazo']],
  [/plancha|crunch|abdominal|\bcore\b|rueda|pallof|elevacion(es)? de piernas/, 'core', []],
  [/press (militar|de hombro|hombro|arnold)|arnold|overhead/, 'hombro', ['triceps']],
  [/elevacion(es)? (lateral|frontal)|laterales|hombro/, 'hombro', []],
  [/pajaro|face pull|posterior/, 'hombro', ['espalda']],
  [/pull ?over/, 'espalda', ['pecho']],
  [/dominada|jalon|remo\b|espalda|pull ?up|chin ?up/, 'espalda', ['biceps', 'antebrazo']],
  [/apertura|cruce|pec deck|contractora/, 'pecho', ['hombro']],
  [/press|banca|flexion|pecho/, 'pecho', ['triceps', 'hombro']]
];
const normName = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n');
function guessMuscles(name) {
  const n = normName(name), hit = MUSCLE_RULES.find(r => r[0].test(n));
  return hit ? { primary: hit[1], secondary: hit[2] } : { primary: '', secondary: [] };
}
const KINDS = ['load', 'bwadd', 'bw', 'iso', 'pct'];
const KIND_LABELS = [['load', 'Carga'], ['bwadd', 'Lastre'], ['bw', 'Corporal'], ['iso', 'Isometría'], ['pct', '% banca']];
const INCS = [0.5, 1, 1.25, 2, 2.5, 5];
const RIR_MAX = 5;
const LIMITS = { days: 14, exercises: 40, sets: 20, reps: 99, draftSets: 20, sessions: 5000, sessionEntries: 60, sessionSets: 30, importBytes: 5e6 };
const WARMUP = [
  ['Movilidad de cadera 90/90', '1 × 8/lado', 'all'], ['Estiramiento de flexor de cadera', '1 × 30"/lado', 'all'],
  ['Band pull apart', '1 × 15–20', 'all'], ['Manguito rotador con goma', '1 × 15–20', 'all'],
  ['Pullover con mancuerna sobre foam', '2 × 10–15', 'all'], ['Flexión isométrica en fitball', '2 × 30" a mitad de recorrido', 'all'],
  ['Muñeca y dedos con goma', '2 × 15', 'torso'], ['Sentadilla monopodal con dorsiflexión', '2 × 10–15', 'pierna'],
  ['Sentadilla isométrica + elevación de talones', '2 × 30"', 'pierna']
];

/* ---------- estado en memoria ---------- */
const S = { cfg: null, sessions: [] };                              // datos persistentes
const UI = { tab: 'hoy', dayId: null, histEx: null, confirm: null, secOpen: new Set() }; // estado de pantalla

/* ---------- fábricas ---------- */
function newExercise(name, sets, repsMin, repsMax, inc, seq, extra) {
  return Object.assign({ id: uid(), name, link: '', sets, repsMin, repsMax, inc, seq, kind: 'load', ss: '', notes: '', bump: null, muscle: '', secondary: null }, extra || {});
}
function newDay(n) { return { id: uid(), name: 'Día ' + n, type: 'torso', exercises: [] }; }
function DEFAULT() {
  return { v: VERSION, cycle: 1, cycleStart: mondayOf(today()), weeks: WEEKS_DEFAULT, cyclesPlanned: 0, rirPlan: [], prevPeak: null, bodyweight: '', rules: '', days: [], drafts: {}, updatedAt: Date.now() };
}

/** Convierte "3·3·2·2·2·1·1·D" en [3,3,2,2,2,1,1,'D'] con n valores; cada RIR entre 0 y 5. */
function parseSeq(s, n) {
  const parts = String(s || '').split(/[·.\-,\s/]+/).filter(Boolean)
    .map(x => /^d$/i.test(x) ? 'D' : (isNaN(+x) ? null : clamp(Math.round(+x), 0, RIR_MAX)))
    .filter(x => x !== null);
  if (!parts.length) parts.push(3);
  while (parts.length < n) parts.push(parts.length === n - 1 ? 'D' : parts[parts.length - 1]);
  return parts.slice(0, n);
}

/* ---------- saneado ---------- */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
// Se rechazan nombres como "__proto__", "constructor" o "toString": como claves de objeto
// devolverían propiedades heredadas en vez de datos y romperían la app.
const isId = x => typeof x === 'string' && ID_RE.test(x) && !(x in Object.prototype);
const str = (x, max) => typeof x === 'string' ? x.slice(0, max) : (typeof x === 'number' && Number.isFinite(x) ? String(x) : '');
const nz = (x, min, max, def) => { const v = typeof x === 'number' ? x : parseFloat(x); return Number.isFinite(v) ? clamp(v, min, max) : def; };
const int = (x, min, max, def) => Math.round(nz(x, min, max, def));
const isDate = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(noon(x).getTime());
const keysOf = (o, max) => isObj(o) ? Object.keys(o).filter(isId).slice(0, max) : [];

/** Solo enlaces http(s); cualquier otro esquema (javascript:, data:…) se anula. */
function safeUrl(u) {
  if (typeof u !== 'string') return '';
  u = u.trim(); if (!/^https?:\/\//i.test(u)) return '';
  try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; } catch (e) { return ''; }
}

function sanitizeExercise(e) {
  const repsMin = int(e.repsMin ?? e.reps, 1, LIMITS.reps, 5);
  const ex = {
    id: e.id, name: str(e.name, 100), link: safeUrl(e.link),
    sets: int(e.sets, 1, LIMITS.sets, 3), repsMin, repsMax: Math.max(repsMin, int(e.repsMax, 1, LIMITS.reps, repsMin)),
    inc: INCS.includes(+e.inc) ? +e.inc : 2.5,
    seq: str(e.seq, 40).replace(/[^0-9Dd·.\-,\s/]/g, '') || SA,
    kind: KINDS.includes(e.kind) ? e.kind : 'load',
    ss: str(e.ss, 2).replace(/[^A-Za-z0-9]/g, ''), notes: str(e.notes, 160),
    bump: (e.bump == null || e.bump === '') ? null : nz(e.bump, 0, 50, null)
  };
  if (isId(e.ref)) ex.ref = e.ref;
  // '' y null significan "automático según el nombre"
  ex.muscle = MUSCLES.includes(e.muscle) ? e.muscle : '';
  ex.secondary = Array.isArray(e.secondary) ? [...new Set(e.secondary.filter(m => MUSCLES.includes(m)))].filter(m => m !== ex.muscle) : null;
  return ex;
}
function sanitizeDraft(d) {
  const out = { date: isDate(d.date) ? d.date : today(), entries: {} };
  keysOf(d.entries, LIMITS.exercises).forEach(k => {
    const en = d.entries[k]; if (!isObj(en)) return;
    const sets = Array.isArray(en.sets) ? en.sets : [];
    out.entries[k] = {
      sets: sets.slice(0, LIMITS.draftSets).filter(isObj).map(x => ({
        kg: str(x.kg, 8).replace(/[^0-9.,]/g, ''), reps: str(x.reps, 4).replace(/[^0-9]/g, ''),
        rir: /^[0-5]$/.test(String(x.rir)) ? String(x.rir) : '', done: x.done === true, auto: x.auto === true
      }))
    };
  });
  return out;
}
/** RIR elegido por semana: '' = el de cada ejercicio, 0–5 = fijo, 'D' = descarga. */
function sanitizeRirPlan(a) {
  return (Array.isArray(a) ? a : []).slice(0, WEEKS_MAX).map(x => x === 'D' ? 'D' : (/^[0-5]$/.test(String(x)) ? +x : ''));
}
/** Reconstruye la configuración solo con campos conocidos y valores acotados. null si no es válida. */
function sanitizeCfg(c) {
  if (!isObj(c)) return null;
  const out = {
    v: nz(c.v, 0, 99, 0), cycle: int(c.cycle, 1, 999, 1), cycleStart: isDate(c.cycleStart) ? c.cycleStart : undefined,
    weeks: int(c.weeks, WEEKS_MIN, WEEKS_MAX, WEEKS_DEFAULT), cyclesPlanned: int(c.cyclesPlanned, 0, CYCLES_MAX, 0), rirPlan: sanitizeRirPlan(c.rirPlan),
    prevPeak: c.prevPeak == null ? null : int(c.prevPeak, 0, WEEKS_MAX - 1, 0),
    bodyweight: str(c.bodyweight, 6).replace(/[^0-9.,]/g, ''), rules: str(c.rules, 4000),
    days: [], drafts: {}, updatedAt: nz(c.updatedAt, 0, 1e15, Date.now())
  };
  const dayIds = new Set(), exIds = new Set();
  (Array.isArray(c.days) ? c.days : []).slice(0, LIMITS.days).forEach(d => {
    if (!isObj(d) || !isId(d.id) || dayIds.has(d.id)) return;
    dayIds.add(d.id);
    const day = { id: d.id, name: str(d.name, 80), type: DAY_TYPES.includes(d.type) ? d.type : 'torso', exercises: [] };
    (Array.isArray(d.exercises) ? d.exercises : []).slice(0, LIMITS.exercises).forEach(e => {
      if (!isObj(e) || !isId(e.id) || exIds.has(e.id)) return;
      exIds.add(e.id);
      day.exercises.push(sanitizeExercise(e));
    });
    out.days.push(day);
  });
  keysOf(c.drafts, LIMITS.days).forEach(k => { if (isObj(c.drafts[k])) out.drafts[k] = sanitizeDraft(c.drafts[k]); });
  return out;
}
function sanitizeSessionEntry(e) {
  const sets = (Array.isArray(e.sets) ? e.sets : []).slice(0, LIMITS.sessionSets).filter(isObj)
    .map(x => ({ kg: nz(x.kg, 0, 1000, 0), reps: int(x.reps, 0, 999, 0), rir: Number.isFinite(parseFloat(x.rir)) ? int(x.rir, 0, 10, 0) : null }))
    .filter(x => x.reps > 0);
  if (!sets.length) return null;
  const t = isObj(e.target) ? e.target : {};
  const ent = {
    name: str(e.name, 100), kind: KINDS.includes(e.kind) ? e.kind : 'load', deload: e.deload === true,
    target: { sets: int(t.sets, 1, 30, sets.length), repsMin: int(t.repsMin ?? t.reps, 1, 999, sets[0].reps), repsMax: int(t.repsMax ?? t.reps, 1, 999, sets[0].reps) },
    sets
  };
  if (e.rir != null) ent.rir = nz(e.rir, 0, 10, 3);
  return ent;
}
function sanitizeSessions(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set(), out = [];
  arr.slice(0, LIMITS.sessions).forEach(s => {
    if (!isObj(s) || !isId(s.id) || seen.has(s.id) || !isDate(s.date)) return;
    seen.add(s.id);
    const entries = {};
    keysOf(s.entries, LIMITS.sessionEntries).forEach(k => {
      const ent = isObj(s.entries[k]) ? sanitizeSessionEntry(s.entries[k]) : null;
      if (ent) entries[k] = ent;
    });
    const o = {
      id: s.id, date: s.date, createdAt: nz(s.createdAt, 0, 1e15, 0), dayId: isId(s.dayId) ? s.dayId : '', dayName: str(s.dayName, 80),
      cycle: int(s.cycle, 1, 999, 1), week: int(s.week, 0, WEEKS_MAX - 1, 0), deload: s.deload === true, entries
    };
    if (s.phase) o.phase = str(s.phase, 24);
    if (s.rir != null) o.rir = nz(s.rir, 0, 10, 3);
    out.push(o);
  });
  return out;
}

/** Completa valores por defecto y aplica migraciones. Recibe una configuración ya saneada. */
function normalize(c) {
  c = isObj(c) ? clone(c) : DEFAULT();
  // Migración v3: belt squat → peso muerto convencional. Un archivo sin versión se trata
  // como actual: nunca se descarta su programa.
  if (!(c.v >= VERSION)) {
    const dlLink = 'https://www.youtube.com/results?search_query=' + encodeURIComponent('Cómo hacer PESO MUERTO CONVENCIONAL como un PROFESIONAL Fit Generation');
    (c.days || []).forEach(day => (day.exercises || []).forEach((e, i) => {
      if (/belt\s*squat/i.test(e.name)) day.exercises[i] = newExercise('Peso muerto convencional', 3, 5, 6, 2.5, SC, { id: e.id, link: dlLink });
    }));
  }
  c.v = VERSION;
  c.weeks = clamp(Math.round(+c.weeks) || WEEKS_DEFAULT, WEEKS_MIN, WEEKS_MAX);
  c.cyclesPlanned = c.cyclesPlanned || 0;
  c.prevPeak = c.prevPeak ?? null;
  c.rirPlan = sanitizeRirPlan(c.rirPlan).slice(0, c.weeks);
  while (c.rirPlan.length < c.weeks) c.rirPlan.push('');
  c.cycle = c.cycle || 1;
  c.cycleStart = c.cycleStart || mondayOf(today());
  c.days = Array.isArray(c.days) ? c.days : [];
  c.days.forEach(day => {
    day.type = day.type || 'torso'; day.exercises = day.exercises || [];
    day.exercises.forEach(e => {
      e.sets = +e.sets || 3; e.repsMin = +e.repsMin || +e.reps || 5; e.repsMax = Math.max(e.repsMin, +e.repsMax || e.repsMin);
      e.inc = +e.inc || 2.5; e.seq = e.seq || SA; e.kind = e.kind || 'load'; e.ss = e.ss || ''; e.link = e.link || ''; e.notes = e.notes || ''; e.muscle = e.muscle || ''; e.secondary = Array.isArray(e.secondary) ? e.secondary : null;
    });
  });
  c.drafts = c.drafts || {};
  c.rules = c.rules || '';
  c.bodyweight = c.bodyweight || '';
  return c;
}

/* ---------- almacenamiento (solo en este móvil) ---------- */
const Store = {
  state: 'local', full: false,
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      if (this.full) { this.full = false; setStatus('local'); }
      return true;
    } catch (e) {
      if (!this.full) { this.full = true; toast('⚠️ No se ha podido guardar (sin espacio). Exporta una copia.'); }
      setStatus('full');
      return false;
    }
  }
};
function persist() { S.cfg.updatedAt = Date.now(); return Store.set('fz_cfg', S.cfg); }
function saveLocalSessions() { return Store.set('fz_ses', S.sessions); }
function loadFromStorage() {
  S.cfg = normalize(sanitizeCfg(Store.get('fz_cfg')) || DEFAULT());
  S.sessions = sanitizeSessions(Store.get('fz_ses'));
}
function setStatus(st) { Store.state = st; const el = $('#status'); if (el) el.textContent = statusText(); }
function statusText() {
  if (Store.state === 'full') return '⚠️ No se puede guardar: falta espacio. Exporta una copia (Ciclo › Copia de seguridad).';
  return '📱 Guardado solo en este móvil —exporta una copia de vez en cuando (Ciclo › Copia de seguridad)';
}
