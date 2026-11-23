"use strict";
/* ============================================================
   motor.js · semanas del ciclo, motor de cargas y borradores
   No toca el DOM: solo calcula a partir de S.cfg y S.sessions.
   ============================================================ */

/* ---------- semanas automáticas ---------- */
function rawWeek(ds) { return Math.floor(daysBetween(S.cfg.cycleStart, ds || today()) / 7); }
function weekIdx(ds) { return clamp(rawWeek(ds), 0, S.cfg.weeks - 1); }
function curWeek() { return weekIdx(today()); }
function cycleOver() { return rawWeek(today()) >= S.cfg.weeks; }

/** Semana de descarga según lo elegido en Ciclo (por defecto, la última). */
function weekDeload(w) { const v = S.cfg.rirPlan[w]; return v === 'D' || ((v === '' || v == null) && w === S.cfg.weeks - 1); }
function phaseOf(w) { return weekDeload(w) ? 'Descarga' : PHASES[Math.min(6, Math.floor(w * 7 / Math.max(1, S.cfg.weeks - 1)))]; }
function lastWorkWeek() { for (let w = S.cfg.weeks - 1; w >= 0; w--) if (!weekDeload(w)) return w; return 0; }
/** Reparte la secuencia de RIR del ejercicio entre las semanas del ciclo, con descarga al final. */
function seqFor(seq, n) {
  if (n === WEEKS_DEFAULT) return parseSeq(seq, n);
  const work = parseSeq(seq, WEEKS_DEFAULT).filter(x => x !== 'D'), vals = work.length ? work : [3];
  return Array.from({ length: n }, (_, i) => i === n - 1 ? 'D' : vals[Math.min(vals.length - 1, Math.floor(i * vals.length / (n - 1)))]);
}

/* ---------- fórmulas ---------- */
// e1RM (Epley con RIR): fuerza máxima estimada a partir de una serie.
const e1 = (load, reps, rir) => load * (1 + (reps + rir) / 30);
const loadFor = (E, reps, rir) => E / (1 + (reps + rir) / 30);
const repsFor = (E, load, rir) => Math.floor(30 * (E / load - 1) - rir);
const BW = () => num(S.cfg.bodyweight) > 0 ? num(S.cfg.bodyweight) : 80;
// Con lastre, la carga real es lastre + peso corporal.
const total = (exo, kg) => exo.kind === 'bwadd' ? kg + BW() : kg;
const fromTotal = (exo, t) => exo.kind === 'bwadd' ? Math.max(0, t - BW()) : t;

/* ---------- consultas ---------- */
function exoById(id) { for (const d of S.cfg.days) for (const e of d.exercises) if (e.id === id) return e; return null; }
function dayOf(exo) { return S.cfg.days.find(d => d.exercises.includes(exo)) || { type: 'torso' }; }
/** Músculo principal e indirectos: lo elegido a mano o, si no, lo propuesto por el nombre. */
function musclesOf(exo) {
  const g = guessMuscles(exo.name), primary = exo.muscle || g.primary;
  const base = Array.isArray(exo.secondary) ? exo.secondary : (exo.muscle && exo.muscle !== g.primary ? [] : g.secondary);
  return { primary, secondary: base.filter(m => m !== primary) };
}
function sortedSessions() {
  return S.sessions.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
}

/** Lo que prescribe el programa para un ejercicio en la semana w (series, rango, RIR, descarga). */
function presc(exo, w) {
  w = w ?? curWeek();
  const chosen = S.cfg.rirPlan[w], fixed = chosen !== '' && chosen != null;   // el RIR elegido en Ciclo manda
  const v = fixed ? chosen : seqFor(exo.seq, S.cfg.weeks)[w];
  const deload = v === 'D' || (!fixed && w === S.cfg.weeks - 1);
  return { w, deload, rir: deload ? 4 : v, sets: deload ? Math.max(1, Math.ceil(exo.sets / 2)) : exo.sets, repsMin: exo.repsMin, repsMax: exo.repsMax };
}

/** Resumen de un ejercicio en una sesión guardada (o null si no se hizo). */
function statsOf(sess, exId, exo) {
  const ent = sess.entries && Object.hasOwn(sess.entries, exId) ? sess.entries[exId] : null;
  if (!ent) return null;
  const kind = (exo && exo.kind) || ent.kind || 'load';
  const sets = (ent.sets || []).filter(s => s.reps > 0 && (kind === 'bw' || kind === 'iso' || kind === 'bwadd' || s.kg > 0));
  if (!sets.length) return null;
  const T = ent.rir ?? sess.rir ?? 3;
  const tl = s => kind === 'bwadd' ? (s.kg || 0) + BW() : (s.kg || 0);
  const es = kind === 'bw' || kind === 'iso' ? [0] : sets.map(s => e1(tl(s), s.reps, s.rir != null ? s.rir : T));
  const tgt = ent.target || { sets: sets.length, repsMin: sets[0].reps };
  const logged = sets.filter(s => s.rir != null);
  const kgs = sets.map(s => s.kg || 0);
  return {
    sess, e: avg(es), kgs, reps: sets.map(s => s.reps), maxKg: Math.max(...kgs), avgKg: avg(kgs), minReps: Math.min(...sets.map(s => s.reps)),
    vol: sets.reduce((sum, s) => sum + tl(s) * s.reps, 0), nSets: sets.length, tgtSets: tgt.sets, avgRir: logged.length ? avg(logged.map(s => s.rir)) : null,
    rirT: T, deload: !!(ent.deload ?? sess.deload), week: sess.week ?? 0, cycle: sess.cycle ?? 1
  };
}
/** Historial de un ejercicio, de más reciente a más antiguo. */
function historyOf(exId) { const exo = exoById(exId); return sortedSessions().map(s => statsOf(s, exId, exo)).filter(Boolean); }
const setsTxt = h => esc(h.kgs.map((k, i) => `${fmt(k)}×${h.reps[i]}`).join(', '));

/** Ejercicios y series por músculo en las sesiones de un periodo: week | cycle | all. */
function muscleStats(range) {
  const monday = mondayOf(today()), out = new Map(), slot = k => { if (!out.has(k)) out.set(k, { dirEx: 0, dirSets: 0, indEx: 0, indSets: 0 }); return out.get(k); };
  S.sessions.filter(s => range === 'all' || (range === 'cycle' ? s.cycle === S.cfg.cycle : s.date >= monday)).forEach(s => {
    Object.entries(s.entries || {}).forEach(([id, ent]) => {
      const m = musclesOf(exoById(id) || { name: ent.name, muscle: '', secondary: null }), n = (ent.sets || []).length;
      const d = slot(m.primary || 'none'); d.dirEx++; d.dirSets += n;
      m.secondary.forEach(k => { const x = slot(k); x.indEx++; x.indSets += n; });
    });
  });
  return out;
}

/* ---------- motor de cargas ----------
   plan(exo, w) → { kg, reps, sets, rir, deload, type, title, msg, e1txt?, flag?, big? }
   type: new | up | keep | hold | deload  (colorea la sugerencia)
   msg puede llevar <b>: todo lo variable que contiene son números o texto ya escapado. */
function plan(exo, w) {
  const p = presc(exo, w), inc = exo.inc || 2.5, T = p.rir;
  const base = { sets: p.sets, rir: T, deload: p.deload, reps: p.repsMin };
  const range = p.repsMin === p.repsMax ? `${p.repsMin}` : `${p.repsMin}–${p.repsMax}`;

  if (exo.kind === 'iso') return planIso(p, base, range);
  if (exo.kind === 'pct') return planPct(exo, p, base, inc);

  const all = historyOf(exo.id);
  const hist = all.filter(h => !h.deload);
  if (!hist.length) {
    return Object.assign(base, {
      kg: null, type: 'new', title: 'Sin historial',
      msg: exo.kind === 'bw' ? `Haz ${range} reps dejando ${T} en recámara.` : `Elige un peso con el que hagas ${range} reps dejando <b>${T}</b> en recámara. Desde aquí lo calculo yo.`
    });
  }
  const last = hist[0];
  // fuerza estimada: si las dos últimas sesiones son comparables, se suaviza
  const Ev = hist[1] && hist[1].rirT === last.rirT ? last.e * 0.65 + hist[1].e * 0.35 : last.e;
  const ctx = {
    exo, p, T, inc, base, last, Ev,
    rr: r => clamp(r, p.repsMin, p.repsMax),
    kgFrom: (reps, rir) => roundTo(fromTotal(exo, loadFor(Ev, reps, rir)), inc),
    repsAt: (kg, rir) => clamp(repsFor(Ev, total(exo, kg), rir), p.repsMin, p.repsMax),
    before: `${setsTxt(last)} a RIR ${last.rirT}`,
    e1txt: exo.kind === 'bw' ? '' : `e1RM est. ${fmt(round1(Ev))} kg${exo.kind === 'bwadd' ? ' (con peso corporal)' : ''}`
  };

  if (p.deload) return planDeload(ctx, all);
  const nc = planNewCycle(ctx, hist); if (nc) return nc;
  if (exo.kind === 'bw') return planBodyweight(ctx);
  if (T < last.rirT) return planRirDown(ctx);
  if (T > last.rirT) return planRirUp(ctx);
  return planSameRir(ctx);
}

function planIso(p, base, range) {
  const eff = p.deload ? 60 : Math.min(90, 60 + 5 * p.w);
  return Object.assign(base, {
    kg: null, reps: p.repsMax, type: p.deload ? 'deload' : 'new', title: `Esfuerzo ${eff}%`, big: eff + '%',
    msg: `${p.sets} series de ${range}" por posición. Sube un 5% de esfuerzo cada semana.`
  });
}
function planPct(exo, p, base, inc) {
  const ref = exo.ref && exoById(exo.ref);
  const rh = ref ? historyOf(ref.id).filter(h => !h.deload) : [];
  const pc = p.deload ? 0.6 : Math.min(0.75, 0.65 + 0.015 * p.w);
  if (!rh.length) {
    return Object.assign(base, { kg: null, type: 'new', title: `${Math.round(pc * 100)}% del máximo`, msg: `Registra primero el press banca de referencia y te calculo el peso. Explosivo, RIR 3 fijo.` });
  }
  return Object.assign(base, {
    kg: roundTo(rh[0].e * pc, inc), reps: p.repsMin, type: p.deload ? 'deload' : 'new', title: `${Math.round(pc * 100)}% de tu máximo de banca`,
    msg: `e1RM de banca ~${fmt(Math.round(rh[0].e))} kg. Cada rep lo más rápido posible.`
  });
}
// Descarga: 50% de series, RIR 4-5, carga de S1
function planDeload({ exo, p, inc, base, last, e1txt }, all) {
  const s1 = all.find(h => h.cycle === S.cfg.cycle && h.week === 0 && !h.deload);
  const kg = exo.kind === 'bw' ? null : (s1 ? s1.maxKg : roundTo(last.avgKg * 0.85, inc));
  return Object.assign(base, { kg, reps: p.repsMin, type: 'deload', title: 'Descarga · RIR 4–5', msg: `${p.sets} series con la carga de S1${s1 ? '' : ' (aprox.)'}. Técnica y recuperar.`, e1txt });
}
// Inicio de ciclo nuevo: carga de S1 anterior + 2,5 kg torso / 5 kg pierna si completaste la última semana de trabajo
function planNewCycle({ exo, inc, base, rr, e1txt }, hist) {
  const c = S.cfg;
  if (c.cycle <= 1 || exo.kind === 'bw' || hist.some(h => h.cycle === c.cycle)) return null;
  const prevS1 = hist.find(h => h.cycle === c.cycle - 1 && h.week === 0);
  if (!prevS1) return null;
  const peak = c.prevPeak ?? lastWorkWeek();
  const s7 = hist.find(h => h.cycle === c.cycle - 1 && h.week === peak);
  const ok = !!s7 && s7.nSets >= s7.tgtSets && s7.minReps >= exo.repsMin && s7.kgs.every(k => k === s7.maxKg) && (s7.avgRir == null || s7.avgRir >= s7.rirT - 0.5);
  const bump = exo.bump != null && exo.bump !== '' ? +exo.bump : (regionOf(musclesOf(exo).primary || dayOf(exo).type) === 'pierna' ? 5 : 2.5);
  const kg = roundTo(prevS1.maxKg + (ok ? bump : 0), inc);
  return Object.assign(base, {
    kg, reps: rr(Math.min(...prevS1.reps)), type: ok ? 'up' : 'keep', flag: ok, e1txt,
    title: ok ? `Ciclo nuevo: +${fmt(bump)} kg` : 'Ciclo nuevo: misma base',
    msg: ok ? `Completaste la S${peak + 1}. S1 anterior: ${setsTxt(prevS1)} → hoy <b>${fmt(kg)} kg</b>.` : `En la S${peak + 1} no completaste todo; repites la base de S1 (${setsTxt(prevS1)}).`
  });
}
function planBodyweight({ p, T, base, last }) {
  const top = last.minReps >= p.repsMax;
  const reps = top ? p.repsMax : Math.min(p.repsMax, last.minReps + 1);
  return Object.assign(base, {
    kg: null, reps, type: top ? 'up' : 'keep', flag: top, title: top ? 'Tope del rango' : '+1 rep',
    msg: top ? `Llegas a ${p.repsMax} en todas: añade lastre o haz más lenta la bajada.` : `Antes ${last.reps.join(', ')} reps. Hoy ${reps} en todas a RIR ${T}.`
  });
}
// Baja el RIR → sube peso (mínimo un salto, máximo +10%)
function planRirDown({ T, inc, base, last, rr, kgFrom, before, e1txt }) {
  const sr = last.reps.slice().sort((a, b) => a - b), reps = rr(sr[Math.floor(sr.length / 2)]);
  let kg = Math.max(kgFrom(reps, T), roundTo(last.avgKg + inc, inc));
  kg = Math.min(kg, Math.max(roundTo(last.maxKg * 1.1, inc), roundTo(last.maxKg + inc, inc)));
  const diff = Math.round((kg - last.maxKg) * 100) / 100;
  return Object.assign(base, {
    kg, reps, type: 'up', flag: true, title: `RIR ${last.rirT} → ${T}: sube peso`, e1txt,
    msg: `Antes ${before}. Hoy <b>${fmt(kg)} kg × ${reps}</b>${diff > 0 ? ` (+${fmt(diff)} kg)` : ''} en todas.`
  });
}
// Sube el RIR (vuelta a un RIR más alto): recalcula la carga
function planRirUp({ p, T, base, kgFrom, before, e1txt }) {
  const reps = p.repsMin;
  return Object.assign(base, { kg: kgFrom(reps, T), reps, type: 'new', title: `RIR ${T}: recalculado`, msg: `Antes ${before}. Carga ajustada a RIR ${T}.`, e1txt });
}
function planSameRir({ p, T, inc, base, last, rr, kgFrom, repsAt, e1txt }) {
  const allSame = last.kgs.every(k => k === last.maxKg);
  const short = last.nSets < last.tgtSets;
  const hard = last.avgRir != null && last.avgRir < T - 0.5;
  const easy = last.avgRir != null && last.avgRir >= T + 1 && !short && allSame && last.minReps >= p.repsMin;
  if (easy) {
    const kg = Math.max(kgFrom(p.repsMin, T), roundTo(last.maxKg + inc, inc)), reps = repsAt(kg, T);
    return Object.assign(base, { kg, reps, type: 'up', flag: true, title: 'Te sobraron reps', msg: `Marcaste RIR ${fmt(round1(last.avgRir))} con ${setsTxt(last)}. Hoy <b>${fmt(kg)} kg × ${reps}</b>.`, e1txt });
  }
  if (!allSame || hard || short || last.minReps < p.repsMin) {
    if (last.minReps >= p.repsMin - 1 || !allSame) {
      const reps = rr(Math.max(...last.reps.filter((r, i) => last.kgs[i] === last.maxKg)));
      return Object.assign(base, { kg: last.maxKg, reps, type: 'hold', title: 'Consolida', msg: `La semana pasada: ${setsTxt(last)}. Esta semana <b>${fmt(last.maxKg)} kg × ${reps}</b> en todas las series, a RIR ${T}.`, e1txt });
    }
    const reps = p.repsMin, kg = Math.min(kgFrom(reps, T), last.maxKg);
    return Object.assign(base, { kg, reps, type: 'hold', title: 'Ajusta la carga', msg: `Costó bastante (${setsTxt(last)}). Hoy <b>${fmt(kg)} kg × ${reps}</b> limpio a RIR ${T}.`, e1txt });
  }
  if (last.minReps >= p.repsMax) {
    const kg = roundTo(last.maxKg + inc, inc), reps = repsAt(kg, T);
    return Object.assign(base, { kg, reps, type: 'up', flag: true, title: 'Tope del rango: sube peso', msg: `Completaste ${setsTxt(last)}. Hoy <b>${fmt(kg)} kg × ${reps}</b>.`, e1txt });
  }
  const reps = Math.min(p.repsMax, last.minReps + 1);
  return Object.assign(base, { kg: last.maxKg, reps, type: 'keep', title: 'Mismo RIR: +1 rep', msg: `Completaste ${setsTxt(last)}. Hoy <b>${fmt(last.maxKg)} kg × ${reps}</b> en todas.`, e1txt });
}

/* ---------- autorregulación dentro de la sesión ----------
   Con la última serie registrada, recalcula el peso de las series pendientes.
   Devuelve { cls, text, changed: [índices modificados] } o null si no hay nada que decir. */
function autoregulate(exo, ent, dateStr) {
  if (exo.kind === 'bw' || exo.kind === 'iso' || exo.kind === 'pct') return null;
  const pl = plan(exo, weekIdx(dateStr)), inc = exo.inc || 2.5;
  let li = -1;
  ent.sets.forEach((s, i) => { if ((s.done || !s.auto) && num(s.kg) >= 0 && num(s.reps) > 0 && s.rir !== '' && s.rir != null) li = i; });
  if (li < 0) return null;
  const s = ent.sets[li], kg = num(s.kg) || 0, reps = num(s.reps), rir = +s.rir;
  const Ex = e1(total(exo, kg), reps, rir);
  const rec = roundTo(fromTotal(exo, loadFor(Ex, +pl.reps || exo.repsMin, pl.rir)), inc);
  if (li >= ent.sets.length - 1) {
    const ok = Math.abs(rir - pl.rir) <= 1 && reps >= exo.repsMin;
    return { cls: ok ? 'ok' : 'down', changed: [], text: ok ? `✔ En objetivo. e1RM ~${fmt(round1(Ex))} kg` : `Última serie a RIR ${rir} (objetivo ${pl.rir}). Lo tengo en cuenta para la próxima.` };
  }
  if (Math.abs(rec - kg) < inc / 2) return { cls: 'ok', changed: [], text: `✔ Clavado. Mantén ${fmt(kg)} kg.` };
  const changed = [];
  ent.sets.forEach((st, i) => { if (i > li && st.auto && !st.done) { st.kg = fmt(rec); changed.push(i); } });
  return rec > kg
    ? { cls: 'up', changed, text: `⬆ Serie ${li + 1} a RIR ${rir}: te sobra. Siguientes a ${fmt(rec)} kg.` }
    : { cls: 'down', changed, text: `⬇ Serie ${li + 1} más dura (RIR ${rir}). Siguientes a ${fmt(rec)} kg para mantener RIR ${pl.rir}.` };
}

/* ---------- borradores (sesión en curso, precargada con el plan) ---------- */
function draftOf(dayId) { return Object.hasOwn(S.cfg.drafts, dayId) ? S.cfg.drafts[dayId] : null; }
function syncDraft(day) {
  const d = draftOf(day.id) || (S.cfg.drafts[day.id] = { date: today(), entries: {} });
  const w = weekIdx(d.date);
  day.exercises.forEach(exo => {
    const pl = plan(exo, w);
    const ent = Object.hasOwn(d.entries, exo.id) ? d.entries[exo.id] : (d.entries[exo.id] = { sets: [] });
    while (ent.sets.length < pl.sets) ent.sets.push({ auto: true });
    while (ent.sets.length > pl.sets && ent.sets[ent.sets.length - 1].auto && !ent.sets[ent.sets.length - 1].done) ent.sets.pop();
    ent.sets.forEach(s => {
      if (s.auto && !s.done) { s.kg = pl.kg != null ? fmt(pl.kg) : ''; s.reps = String(pl.reps); s.rir = String(pl.rir); }
    });
  });
  return d;
}
function draftHasData(d) { return !!d && Object.values(d.entries || {}).some(e => e.sets.some(s => s.done || !s.auto)); }
/** Al cambiar de semana, los borradores sin datos pasan a la fecha de hoy. */
function resetAutoDates() { Object.values(S.cfg.drafts).forEach(d => { if (!draftHasData(d)) d.date = today(); }); }
/** Convierte el borrador de un día en una sesión guardada. null si no hay ninguna serie hecha. */
function buildSession(day, dr) {
  const w = weekIdx(dr.date), entries = {};
  day.exercises.forEach(exo => {
    const p = presc(exo, w);
    const src = Object.hasOwn(dr.entries, exo.id) ? dr.entries[exo.id].sets : [];
    const sets = src.filter(s => s.done || !s.auto)
      .map(s => ({ kg: num(s.kg) || 0, reps: parseInt(s.reps, 10), rir: s.rir === '' || s.rir == null ? null : +s.rir }))
      .filter(s => s.reps > 0 && (s.kg > 0 || ['bw', 'bwadd', 'iso'].includes(exo.kind)));
    if (sets.length) entries[exo.id] = { name: exo.name, kind: exo.kind, rir: p.rir, deload: p.deload, target: { sets: p.sets, repsMin: p.repsMin, repsMax: p.repsMax }, sets };
  });
  if (!Object.keys(entries).length) return null;
  return { id: uid(), date: dr.date || today(), createdAt: Date.now(), dayId: day.id, dayName: day.name, cycle: S.cfg.cycle, week: w, phase: phaseOf(w), entries };
}
