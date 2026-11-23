"use strict";
/* ============================================================
   vistas.js · HTML de cada pestaña
   Regla: todo texto que venga de datos se pasa por esc().
   Los ids ya están validados (solo letras, números, _ y -).
   ============================================================ */

const youtubeSearch = q => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
const opt = (value, label, selected) => `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
const confirmBtn = (key, act, attrs, label) => UI.confirm === key
  ? `<button class="btn sm danger" data-act="${act}" ${attrs}>¿Borrar?</button>`
  : `<button class="btn sm ghost" data-act="ask${act}" ${attrs} aria-label="${label}">🗑</button>`;

function render() {
  const c = S.cfg, w = curWeek();
  $('#wkchip').innerHTML = cycleOver() ? '<b>Ciclo terminado</b>' : `S${w + 1}/${c.weeks} · <b>${phaseOf(w)}</b>`;
  $('#tabs').dataset.active = UI.tab;
  document.querySelectorAll('#tabs button').forEach(b => {
    const on = b.dataset.tab === UI.tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const view = { hoy: viewHoy, programa: viewPrograma, bloque: viewCiclo, historial: viewHistorial }[UI.tab] || viewHoy;
  $('#view').innerHTML = view() + `<p class="status" id="status">${statusText()}</p>`;
  renderFoot();
  if (UI.tab === 'hoy') { const day = c.days.find(d => d.id === UI.dayId); if (day) day.exercises.forEach(e => updateHint(e.id)); }
  Guide.maybeStart(); // guia.js: guía de primera vez si no se ha visto
}
function renderFoot() {
  const foot = $('#foot'), c = S.cfg;
  if (UI.tab !== 'hoy' || !c.days.length) { foot.hidden = true; return; }
  const dr = draftOf(UI.dayId);
  foot.hidden = false;
  foot.innerHTML = `<div class="in"><input type="date" id="sdate" class="date-auto" value="${esc(dr ? dr.date : today())}"><button class="btn pri sp" data-act="savesession">Guardar sesión</button></div>`;
}

/* ---------- Entrenar ---------- */
function viewHoy() {
  const c = S.cfg;
  if (!c.days.length) {
    return `<div class="empty"><b class="empty-title">Carga tu plan</b><br><br>Importa tu archivo de plan (o una copia de seguridad) y tendrás tus días listos. Todo se guarda solo en este móvil.<br><br>
      <label class="btn pri">Importar archivo<input type="file" id="impfile" accept=".json,application/json" hidden></label><br><br>
      <button class="btn ghost sm" data-tab="programa">O créalo a mano en Programa</button></div>`;
  }
  if (!c.days.some(d => d.id === UI.dayId)) UI.dayId = c.days[0].id;
  const day = c.days.find(d => d.id === UI.dayId);
  const dr = syncDraft(day), w = weekIdx(dr.date);
  const plans = day.exercises.map(e => plan(e, w));
  let html = `<div class="chips">${c.days.map(d => `<button class="chip ${d.id === day.id ? 'on' : ''}" data-act="day" data-id="${d.id}">${esc(d.name)}${draftHasData(draftOf(d.id)) ? ' •' : ''}</button>`).join('')}</div>`;
  html += bannerHoy(w, plans.filter(p => p.flag).length);
  html += warmupCard(day);
  day.exercises.forEach((exo, idx) => { html += exerciseCard(day, exo, idx, plans[idx], dr.entries[exo.id]); });
  return html;
}
function bannerHoy(w, ups) {
  const c = S.cfg;
  let html = '';
  if (cycleOver()) html += `<div class="banner info"><b>Has terminado las ${c.weeks} semanas.</b> Empieza el ciclo nuevo: ${c.cyclesPlanned && c.cycle >= c.cyclesPlanned ? 'Era tu último ciclo planificado, pero puedes seguir: ' : ''}te subo 2,5 kg en torso y 5 kg en pierna donde completaste la S${lastWorkWeek() + 1}.<br><button class="btn sm pri mt8" data-act="newcycle">Empezar ciclo nuevo</button></div>`;
  if (weekDeload(w)) return html + `<div class="banner dl"><b>Semana ${w + 1} · Descarga.</b> Mitad de series, RIR 4–5 y la carga de la S1.</div>`;
  if (ups) return html + `<div class="banner up"><b>Semana ${w + 1} · ${phaseOf(w)}.</b> He reconfigurado tu sesión: <b>${ups}</b> ejercicio${ups > 1 ? 's suben' : ' sube'} de peso (⬆). Todo está precargado; cambia lo que quieras.</div>`;
  return html + `<div class="banner info"><b>Semana ${w + 1} · ${phaseOf(w)}.</b> Sesión precargada con lo que toca. Marca ✓ cada serie hecha o corrige los números.</div>`;
}
function warmupCard(day) {
  // calentamiento de la zona que más ejercicios tiene ese día; si empatan, la del día
  const zones = day.exercises.map(e => musclesOf(e).primary).filter(Boolean).map(regionOf);
  const legs = zones.filter(z => z === 'pierna').length, upper = zones.length - legs;
  const zone = legs > upper ? 'pierna' : upper > legs ? 'torso' : regionOf(day.type);
  const items = WARMUP.filter(x => x[2] === 'all' || x[2] === zone);
  return `<div class="card"><details><summary><b class="tx">🔥 Calentamiento</b> · 10–12 min</summary><div class="wu mt8">${items.map(x => `<label><input type="checkbox"><div>${esc(x[0])}<div class="d">${esc(x[1])}</div></div></label>`).join('')}</div></details></div>`;
}
function exerciseCard(day, exo, idx, pl, ent) {
  const link = safeUrl(exo.link) || youtubeSearch(exo.name);
  const ssPos = exo.ss ? day.exercises.filter((e, j) => e.ss === exo.ss && j <= idx).length : 0;
  const range = exo.repsMin === exo.repsMax ? exo.repsMin : `${exo.repsMin}–${exo.repsMax}`;
  const isIso = exo.kind === 'iso', noKg = exo.kind === 'bw';
  const big = pl.big || (pl.kg != null ? `${fmt(pl.kg)}<span class="small"> kg</span> × ${pl.reps}` : (noKg ? `${pl.reps}<span class="small"> reps</span>` : '—'));
  const autoCls = st => st.auto && !st.done ? 'auto' : '';
  const attrs = i => `data-ex="${exo.id}" data-i="${i}"`;
  const rows = ent.sets.map((st, i) => `<div class="n">${i + 1}</div>
      <input class="num ${autoCls(st)}" inputmode="decimal" ${attrs(i)} data-f="kg" value="${esc(st.kg)}" placeholder="${noKg ? '—' : 'kg'}">
      <input class="num ${autoCls(st)}" inputmode="numeric" ${attrs(i)} data-f="reps" value="${esc(st.reps)}">
      <select class="num" ${attrs(i)} data-f="rir">${['', 0, 1, 2, 3, 4, 5].map(r => opt(r, r === '' ? '—' : r, String(st.rir) === String(r))).join('')}</select>
      <button class="ck ${st.done ? 'on' : ''}" data-act="done" ${attrs(i)} aria-label="Serie hecha">✓</button>`).join('');
  return `<div class="card ${exo.ss ? 'ss' : ''}" id="card-${exo.id}">
    <div class="exhead"><div class="sp">${pl.flag ? '<span class="flag">⬆ Sube</span> ' : ''}${exo.ss ? `<span class="ssb">Superserie ${esc(exo.ss)}${ssPos}</span>` : ''}<div class="exname">${esc(exo.name)}</div>
      <div class="presc">${pl.sets}×${range}${isIso ? '"' : ''} · RIR ${pl.deload ? '4–5' : pl.rir}${exo.notes ? ' · ' + esc(exo.notes) : ''}</div></div>
      <a class="link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">▶ Vídeo</a></div>
    <div class="sug ${pl.type}"><div class="big">${big}</div>
      <div class="sp"><b>${esc(pl.title)}</b><br><span>${pl.msg}</span>${pl.e1txt ? `<div class="mut small mono mt3">${esc(pl.e1txt)}</div>` : ''}</div></div>
    <div class="sets"><div class="hd">#</div><div class="hd">${exo.kind === 'bwadd' ? 'lastre' : 'kg'}</div><div class="hd">${isIso ? 'seg' : 'reps'}</div><div class="hd">RIR</div><div></div>${rows}</div>
    <div class="hint" id="hint-${exo.id}"></div>
    <div class="row mt8"><button class="btn sm ghost" data-act="addset" data-ex="${exo.id}">+ serie</button>${ent.sets.length > 1 ? `<button class="btn sm ghost" data-act="rmset" data-ex="${exo.id}">− serie</button>` : ''}<span class="sp"></span><button class="btn sm ghost" data-act="alldone" data-ex="${exo.id}">✓ todas</button></div>
  </div>`;
}
/** Pinta la pista de autorregulación y actualiza en pantalla las series que se hayan recalculado. */
function updateHint(exId) {
  const day = S.cfg.days.find(d => d.id === UI.dayId), dr = draftOf(UI.dayId);
  const exo = day && day.exercises.find(e => e.id === exId);
  const el = document.getElementById('hint-' + exId);
  if (!exo || !dr || !el || !Object.hasOwn(dr.entries, exId)) return;
  const r = autoregulate(exo, dr.entries[exId], dr.date);
  el.className = 'hint' + (r ? ' ' + r.cls : '');
  el.textContent = r ? r.text : '';
  if (!r || !r.changed.length) return;
  r.changed.forEach(i => {
    const inp = document.querySelector(`input[data-ex="${exId}"][data-i="${i}"][data-f="kg"]`);
    if (inp) inp.value = dr.entries[exId].sets[i].kg;
  });
  persist();
}

/* ---------- Programa ---------- */
function viewPrograma() {
  const c = S.cfg;
  let html = `<h2>Programa</h2>
  <div class="card"><div class="grid2"><div><label class="f">Peso corporal (para lastrados)</label><input class="num" inputmode="decimal" data-g="bodyweight" value="${esc(c.bodyweight)}" placeholder="80"></div>
  <div class="end"><span class="mut small">Tus datos solo están en este móvil.</span></div></div>
  <p class="mut small mb0">RIR por semana: valores entre 0 y 5; la D es la descarga (ej. 3·3·2·2·2·1·1·D). Si fijas un RIR en Ciclo, ese manda. Tipo: carga, lastre, peso corporal, isometría o % de banca.</p></div>`;
  c.days.forEach(day => {
    html += `<div class="card"><div class="row"><input class="bold" data-p="dayname" data-d="${day.id}" value="${esc(day.name)}">
      ${confirmBtn('day' + day.id, 'delday', `data-d="${day.id}"`, 'Borrar día')}</div>`;
    day.exercises.forEach((exo, i) => { html += exerciseEditor(day, exo, i); });
    html += `<button class="btn sm mt12" data-act="addex" data-d="${day.id}">+ Ejercicio</button></div>`;
  });
  return html + `<button class="btn full" data-act="addday">+ Añadir día</button>`;
}
const autoLabel = name => { const g = guessMuscles(name); return g.primary ? `Automático · ${MUSCLE_LABEL[g.primary]}` : 'Sin asignar'; };
const secText = list => 'Indirectos: ' + (list.length ? list.map(m => MUSCLE_LABEL[m]).join(', ') : 'ninguno');
function muscleEditor(exo, a) {
  const m = musclesOf(exo);
  const groups = MUSCLE_GROUPS.map(([g, items]) => `<optgroup label="${esc(g)}">${items.map(([v, l]) => opt(v, l, exo.muscle === v)).join('')}</optgroup>`).join('');
  const chips = MUSCLES.map(k => `<button class="mchip ${m.secondary.includes(k) ? 'on' : ''}" data-act="togsec" ${a} data-m="${k}" aria-pressed="${m.secondary.includes(k)}" ${k === m.primary ? 'disabled' : ''}>${esc(MUSCLE_LABEL[k])}</button>`).join('');
  return `<div class="mt8" data-musbox="${exo.id}"><label class="f">Músculo principal</label>
      <select data-p="muscle" ${a}>${opt('', autoLabel(exo.name), !exo.muscle)}${groups}</select>
      <details class="secbox" data-sec="${exo.id}" ${UI.secOpen.has(exo.id) ? 'open' : ''}><summary class="sec-sum">${esc(secText(m.secondary))}</summary><div class="mchips">${chips}</div></details></div>`;
}
/** Actualiza los músculos en pantalla sin repintar, para no quitar el foco del campo que se edita. */
function paintMuscles(exo) {
  const box = document.querySelector(`[data-musbox="${exo.id}"]`); if (!box) return;
  const m = musclesOf(exo);
  box.querySelector('option[value=""]').textContent = autoLabel(exo.name);
  box.querySelector('.sec-sum').textContent = secText(m.secondary);
  box.querySelectorAll('.mchip').forEach(b => {
    const on = m.secondary.includes(b.dataset.m);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.disabled = b.dataset.m === m.primary;
  });
}
function exerciseEditor(day, exo, i) {
  const a = `data-d="${day.id}" data-e="${exo.id}"`;
  const field = (label, html) => `<div><label class="f">${label}</label>${html}</div>`;
  return `<div class="exedit">
    <div class="row"><input class="semibold" data-p="name" ${a} value="${esc(exo.name)}">
      <button class="btn sm ghost" data-act="mv" ${a} data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
      <button class="btn sm ghost" data-act="mv" ${a} data-dir="1" ${i === day.exercises.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button></div>
    <div class="grid3 mt8">
      ${field('Series', `<input class="num" inputmode="numeric" data-p="sets" ${a} value="${exo.sets}">`)}
      ${field('Reps mín', `<input class="num" inputmode="numeric" data-p="repsMin" ${a} value="${exo.repsMin}">`)}
      ${field('Reps máx', `<input class="num" inputmode="numeric" data-p="repsMax" ${a} value="${exo.repsMax}">`)}
    </div>
    <div class="grid3 mt8">
      ${field('Salto kg', `<select class="num" data-p="inc" ${a}>${INCS.map(v => opt(v, fmt(v), exo.inc === v)).join('')}</select>`)}
      ${field('Superserie', `<input class="num" data-p="ss" ${a} value="${esc(exo.ss)}" placeholder="—" maxlength="2">`)}
      ${field('Tipo', `<select data-p="kind" ${a}>${KIND_LABELS.map(([v, l]) => opt(v, l, exo.kind === v)).join('')}</select>`)}
    </div>
    ${muscleEditor(exo, a)}
    <div class="mt8">${field(`RIR S1 → S${S.cfg.weeks}`, `<input class="mono" data-p="seq" ${a} value="${esc(exo.seq)}">`)}</div>
    <div class="mt8">${field('Enlace al vídeo (vacío = búsqueda en YouTube)', `<input data-p="link" ${a} value="${esc(exo.link)}" placeholder="https://…" inputmode="url">`)}</div>
    <div class="row mt8"><input data-p="notes" ${a} value="${esc(exo.notes)}" placeholder="Nota">
      ${confirmBtn('ex' + exo.id, 'delex', a, 'Borrar ejercicio')}</div>
  </div>`;
}

/* ---------- Ciclo ---------- */
function viewCiclo() {
  const c = S.cfg, w = curWeek(), over = cycleOver();
  const rirOpts = v => [['', 'Plan'], ...[0, 1, 2, 3, 4, 5].map(r => [r, 'RIR ' + r]), ['D', 'Desc.']].map(([x, l]) => opt(x, l, String(v) === String(x))).join('');
  const weeks = Array.from({ length: c.weeks }, (_, i) => `<div class="w ${i === w && !over ? 'cur' : ''}">
      <div class="wl">S${i + 1}${i === w && !over ? ' ●' : ''}</div><div>${phaseOf(i)}<div class="mut small">${fdate(addDays(c.cycleStart, i * 7))} – ${fdate(addDays(c.cycleStart, i * 7 + 6))}</div></div>
      <select class="rirsel" data-rirw="${i}" aria-label="RIR de la semana ${i + 1}">${rirOpts(c.rirPlan[i])}</select>
      ${i !== w ? `<button class="btn sm ghost" data-act="setwk" data-i="${i}">Ir</button>` : '<span></span>'}</div>`).join('');
  const weekOpts = Array.from({ length: WEEKS_MAX - WEEKS_MIN + 1 }, (_, i) => opt(i + WEEKS_MIN, `${i + WEEKS_MIN} semanas`, c.weeks === i + WEEKS_MIN)).join('');
  return `<h2>Ciclo ${c.cycle}${c.cyclesPlanned >= c.cycle ? ` de ${c.cyclesPlanned}` : ''}</h2>
  <div class="card"><div class="grid2"><div><label class="f">Número de ciclos</label><input class="num" inputmode="numeric" data-g="cyclesPlanned" value="${c.cyclesPlanned || ''}" placeholder="Sin límite"></div>
    <div><label class="f">Semanas por ciclo</label><select data-g="weeks">${weekOpts}</select></div></div>
    <div class="grid2 mt10"><div><label class="f">Empezó el lunes</label><input type="date" data-g="cycleStart" value="${esc(c.cycleStart)}"></div>
    <div class="end"><span class="mut small">La semana cambia sola cada lunes.</span></div></div>
    <p class="mut small mb0">RIR de cada semana: <span class="tx">Plan</span> usa el de cada ejercicio; un número lo fija para todos; <span class="tx">Desc.</span> es descarga.</p>
    <div class="weeks mt10">${weeks}</div>
    <button class="btn full pri mt14" data-act="newcycle">Empezar ciclo nuevo</button>
    <p class="mut small">Al empezar ciclo: +2,5 kg en tren superior y +5 kg en tren inferior sobre tu S1 en los ejercicios donde completaste la última semana de trabajo.</p></div>

  <div class="card"><div class="row"><div class="sp"><h3>Ayuda</h3><span class="mut small">Repasa cómo funciona la app.</span></div><button class="btn sm" data-act="guide">📖 Ver guía</button></div></div>

  <div class="card explain"><details><summary>Cómo calcula los pesos</summary>
    <p>Cada serie se convierte en fuerza estimada: <code>e1RM = kg × (1 + (reps + RIR) / 30)</code>.</p>
    <p><b>Semana que repite RIR</b>: si completaste todo, +1 rep (o +peso si llegaste al tope del rango). Si tuviste que bajar peso o reps, consolida: mismo peso arriba en todas las series.</p>
    <p><b>Baja el RIR</b>: sube como mínimo un salto sobre tu media anterior (tope +10%), con las reps que hiciste.</p>
    <p><b>Durante la sesión</b>: si una serie te sale con otro RIR, reajusto las series pendientes.</p>
    <p><b>Banca de velocidad</b>: del 65% al 75% de tu e1RM de banca. <b>Isometrías</b>: 60% → 90%. <b>Descarga</b>: 50% series, RIR 4–5, carga de S1.</p>
  </details></div>

  <div class="card"><h3>🛡️ Tus normas</h3><p class="mut small">Notas privadas: se guardan solo en este móvil.</p>
    <textarea data-g="rules" rows="7" placeholder="Escribe aquí tus normas o importa tu plan">${esc(c.rules)}</textarea></div>

  <div class="card"><h3>Copia de seguridad</h3><p class="mut small">Guarda la copia en Archivos, iCloud Drive o Google Drive. Si borras la app o cambias de móvil, la importas y recuperas todo.</p>
    <div class="row wrap"><button class="btn sm pri" data-act="exportfile">Exportar a archivo</button><label class="btn sm">Importar archivo<input type="file" id="impfile" accept=".json,application/json" hidden></label></div>
    <div class="row wrap mt8"><button class="btn sm ghost" data-act="export">Copiar texto</button><button class="btn sm ghost" data-act="showimport">Pegar texto…</button></div>
    <div id="iozone"></div></div>`;
}

/* ---------- Historial ---------- */
function viewHistorial() {
  const ss = sortedSessions();
  if (!ss.length) return `<h2>Historial</h2><div class="empty">Aún no hay sesiones guardadas.</div>`;
  // ejercicios con carga que aparecen en el historial (nombre actual si sigue en el programa)
  const exMap = new Map();
  ss.forEach(s => Object.entries(s.entries || {}).forEach(([id, e]) => { if (!exMap.has(id) && e.kind !== 'bw' && e.kind !== 'iso') exMap.set(id, e.name); }));
  S.cfg.days.forEach(d => d.exercises.forEach(e => { if (exMap.has(e.id)) exMap.set(e.id, e.name); }));
  if (!UI.histEx || !exMap.has(UI.histEx)) UI.histEx = exMap.keys().next().value || null;
  let html = `<h2>Historial</h2>`;
  if (UI.histEx) html += progressCard(exMap);
  html += muscleCard();
  html += volumeCard();
  html += '<div class="card">' + ss.map(sessionRow).join('') + '</div>';
  return html;
}
const METRICS = { e: ['Fuerza', 'e1RM estimado', h => h.e], kg: ['Peso', 'Peso máximo', h => h.maxKg], vol: ['Volumen', 'Volumen (kg × reps)', h => h.vol] };
const kgTxt = v => Math.round(v).toLocaleString('es-ES') + ' kg';
const valTxt = (m, v) => m === 'vol' ? kgTxt(v) : fmt(round1(v)) + ' kg';
const Chart = { line: [], bars: [] };   // datos de la gráfica en pantalla, para leer el punto tocado

function progressCard(exMap) {
  const m = Object.hasOwn(METRICS, UI.histMetric) ? UI.histMetric : 'e', get = METRICS[m][2];
  const pts = historyOf(UI.histEx).filter(h => !h.deload).reverse(), vals = pts.map(get);
  const tabs = Object.entries(METRICS).map(([k, x]) => `<button class="seg ${k === m ? 'on' : ''}" data-act="histmetric" data-m="${k}" aria-pressed="${k === m}">${x[0]}</button>`).join('');
  let kpis = '';
  if (vals.length) {
    const d = vals[vals.length - 1] - vals[0], arrow = d > 0 ? '↑' : d < 0 ? '↓' : '=';
    const tile = (l, v) => `<div class="kpi"><div class="kpi-l">${l}</div><div class="kpi-v">${v}</div></div>`;
    kpis = `<div class="kpis">${tile('Actual', valTxt(m, vals[vals.length - 1]))}${tile('Mejor', valTxt(m, Math.max(...vals)))}${tile('Cambio', `${arrow} ${valTxt(m, Math.abs(d))}`)}</div>`;
  }
  return `<div class="card"><h3>Progreso</h3>
    <select class="mt8" data-act="histex" aria-label="Ejercicio">${[...exMap].map(([id, n]) => opt(id, n, id === UI.histEx)).join('')}</select>
    <div class="segs mt8" role="group" aria-label="Métrica">${tabs}</div>${kpis}${lineChart(pts, m)}</div>`;
}
function lineChart(pts, m) {
  Chart.line = [];
  if (pts.length < 2) return `<p class="mut small">Con 2 sesiones de este ejercicio verás la curva.</p>`;
  const get = METRICS[m][2], W = 340, H = 190, L = 46, Rg = 12, T = 12, B = 26;
  const vals = pts.map(get), rawMin = Math.min(...vals), rawMax = Math.max(...vals), margin = ((rawMax - rawMin) || Math.max(rawMax * 0.05, 1)) * 0.15;
  const lo = Math.max(0, rawMin - margin), hi = rawMax + margin, days = pts.map(p => daysBetween(pts[0].sess.date, p.sess.date)), span = days[days.length - 1];
  const px = i => L + (span > 0 ? days[i] / span : i / (pts.length - 1)) * (W - L - Rg), py = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const xy = pts.map((p, i) => [round1(px(i)), round1(py(vals[i]))]);
  const grid = [0, 0.5, 1].map(f => { const v = lo + (hi - lo) * f, y = round1(py(v)); return `<line class="ch-grid" x1="${L}" x2="${W - Rg}" y1="${y}" y2="${y}"/><text class="ch-txt" x="${L - 6}" y="${y + 4}" text-anchor="end">${Math.round(v).toLocaleString('es-ES')}</text>`; }).join('');
  const hit = xy.map((p, i) => { const a = i ? (xy[i - 1][0] + p[0]) / 2 : L, b = i < xy.length - 1 ? (p[0] + xy[i + 1][0]) / 2 : W - Rg; return `<rect class="ch-hit" data-act="linept" data-i="${i}" x="${round1(a)}" y="${T}" width="${round1(Math.max(b - a, 1))}" height="${H - T - B}"/>`; }).join('');
  const last = xy[xy.length - 1];
  Chart.line = pts.map((p, i) => ({ x: xy[i][0], y: xy[i][1], text: `${fdate(p.sess.date)} · ${valTxt(m, vals[i])} · ${p.kgs.map((k, j) => `${fmt(k)}×${p.reps[j]}`).join(', ')}` }));
  const rows = pts.map((p, i) => `<tr><td>${fdate(p.sess.date)}</td><td>${esc(valTxt(m, vals[i]))}</td></tr>`).reverse().join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" class="mt10 ch" role="img" aria-label="Evolución de ${esc(METRICS[m][1])}: de ${esc(valTxt(m, vals[0]))} a ${esc(valTxt(m, vals[vals.length - 1]))}">
    ${grid}<polyline class="ch-line" points="${xy.map(p => p.join(',')).join(' ')}"/>
    ${xy.length <= 14 ? xy.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4" class="ch-dot"/>`).join('') : ''}
    <line id="line-cur" class="ch-cursor" x1="${last[0]}" x2="${last[0]}" y1="${T}" y2="${H - B}"/><circle id="line-dot" class="ch-active" cx="${last[0]}" cy="${last[1]}" r="5.5"/>
    <text class="ch-txt" x="${L}" y="${H - 7}">${esc(fdate(pts[0].sess.date))}</text><text class="ch-txt" x="${W - Rg}" y="${H - 7}" text-anchor="end">${esc(fdate(pts[pts.length - 1].sess.date))}</text>${hit}</svg>
    <div class="ch-read" id="line-read" aria-live="polite">${esc(Chart.line[Chart.line.length - 1].text)}</div>
    <details class="ch-data"><summary>Ver datos</summary><table><thead><tr><th>Fecha</th><th>${esc(METRICS[m][0])}</th></tr></thead><tbody>${rows}</tbody></table></details>`;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const MUSCLE_RANGES = { week: 'Esta semana', cycle: 'Este ciclo', all: 'Todo' };
function muscleCard() {
  const r = Object.hasOwn(MUSCLE_RANGES, UI.muscleRange) ? UI.muscleRange : 'week';
  const tabs = Object.entries(MUSCLE_RANGES).map(([k, l]) => `<button class="seg ${k === r ? 'on' : ''}" data-act="musrange" data-r="${k}" aria-pressed="${k === r}">${l}</button>`).join('');
  const stats = [...muscleStats(r)].sort((a, b) => (b[0] !== 'none') - (a[0] !== 'none') || b[1].dirSets - a[1].dirSets || b[1].indSets - a[1].indSets);
  const head = `<div class="card"><h3>Músculos trabajados</h3><div class="segs mt8" role="group" aria-label="Periodo">${tabs}</div>`;
  if (!stats.length) return head + `<p class="mut small mb0">Aún no hay sesiones en este periodo.</p></div>`;
  const direct = stats.filter(([k, x]) => k !== 'none' && x.dirEx).slice(0, 3).map(([k, x]) => `${plural(x.dirEx, 'ejercicio', 'ejercicios')} de ${MUSCLE_LABEL[k].toLowerCase()}`);
  const mx = Math.max(...stats.map(([, x]) => x.dirSets + x.indSets));
  const rows = stats.map(([k, x]) => {
    const name = k === 'none' ? 'Sin asignar' : MUSCLE_LABEL[k], W = 300, dw = x.dirSets / mx * W, iw = x.indSets / mx * W;
    const bars = (x.dirSets ? `<rect class="mbar-d" x="0" y="0" width="${round1(Math.max(dw - (x.indSets ? 1 : 0), 2))}" height="8" rx="2"/>` : '') + (x.indSets ? `<rect class="mbar-i" x="${round1(dw + (x.dirSets ? 1 : 0))}" y="0" width="${round1(Math.max(iw - (x.dirSets ? 1 : 0), 2))}" height="8" rx="2"/>` : '');
    const main = x.dirEx ? `${plural(x.dirEx, 'ejercicio', 'ejercicios')} · ${plural(x.dirSets, 'serie', 'series')}` : 'Solo indirecto';
    const ind = x.indEx ? `<div class="mrow-i">Indirecto: ${plural(x.indEx, 'ejercicio', 'ejercicios')} · ${plural(x.indSets, 'serie', 'series')}</div>` : '';
    return `<div class="mrow"><div class="mrow-h"><span class="semibold">${esc(name)}</span><span class="mut small">${main}</span></div>
      <svg class="mbar" viewBox="0 0 ${W} 8" preserveAspectRatio="none" width="100%" height="8" role="img" aria-label="${esc(name)}: ${x.dirSets} series directas y ${x.indSets} indirectas">${bars}</svg>${ind}</div>`;
  }).join('');
  return head + (direct.length ? `<p class="m-sum">Has hecho ${esc(direct.join(', '))}.</p>` : '') +
    `<div class="mlegend"><span><i class="sw-d"></i>Directo</span><span><i class="sw-i"></i>Indirecto</span></div>${rows}</div>`;
}
/** Volumen total (kg × reps) de las últimas 8 semanas, incluidas las vacías. */
function weeklyVolume() {
  const now = mondayOf(today()), weeks = Array.from({ length: 8 }, (_, i) => ({ start: addDays(now, (i - 7) * 7), vol: 0 }));
  const byStart = new Map(weeks.map(x => [x.start, x]));
  S.sessions.forEach(s => {
    const wk = byStart.get(mondayOf(s.date)); if (!wk) return;
    Object.keys(s.entries || {}).forEach(id => {
      const exo = exoById(id), st = statsOf(s, id, exo);
      if (st && ((exo && exo.kind) || s.entries[id].kind) !== 'iso') wk.vol += st.vol;
    });
  });
  return weeks;
}
function volumeCard() {
  const weeks = weeklyVolume(), W = 340, H = 150, L = 8, Rg = 8, T = 10, B = 24, mx = Math.max(...weeks.map(x => x.vol));
  Chart.bars = weeks.map(x => `Semana del ${fdate(x.start)} · ${x.vol ? kgTxt(x.vol) : 'sin sesiones'}`);
  if (!mx) return `<div class="card"><h3>Volumen semanal</h3><p class="mut small mb0">Aún no hay volumen en las últimas 8 semanas.</p></div>`;
  const slot = (W - L - Rg) / 8, bw = slot - 8, base = H - B, plot = base - T;
  const bars = weeks.map((x, i) => {
    const h = x.vol ? Math.max(3, x.vol / mx * plot) : 0, X = round1(L + i * slot + 4), Y = round1(base - h), r = Math.min(4, h, bw / 2);
    const shape = h ? `<path class="ch-bar ${i === 7 ? 'cur' : ''}" data-bar="${i}" d="M${X} ${base}V${round1(Y + r)}Q${X} ${Y} ${round1(X + r)} ${Y}H${round1(X + bw - r)}Q${round1(X + bw)} ${Y} ${round1(X + bw)} ${round1(Y + r)}V${base}Z"/>` : '';
    const label = i % 2 === 1 ? `<text class="ch-txt" x="${round1(X + bw / 2)}" y="${H - 7}" text-anchor="middle">${esc(fdate(x.start))}</text>` : '';
    return shape + label + `<rect class="ch-hit" data-act="volpt" data-i="${i}" x="${round1(L + i * slot)}" y="${T}" width="${round1(slot)}" height="${plot}"/>`;
  }).join('');
  const rows = weeks.slice().reverse().map(x => `<tr><td>${esc(fdate(x.start))}</td><td>${x.vol ? esc(kgTxt(x.vol)) : '—'}</td></tr>`).join('');
  return `<div class="card"><h3>Volumen semanal</h3><p class="mut small mb0">Kilos × repeticiones de todos tus ejercicios.</p>
    <svg viewBox="0 0 ${W} ${H}" width="100%" class="mt10 ch" role="img" aria-label="Volumen de las últimas 8 semanas; máximo ${esc(kgTxt(mx))}"><line class="ch-axis" x1="${L}" x2="${W - Rg}" y1="${base}" y2="${base}"/>${bars}</svg>
    <div class="ch-read" id="vol-read" aria-live="polite">${esc(Chart.bars[7])}</div>
    <details class="ch-data"><summary>Ver datos</summary><table><thead><tr><th>Semana</th><th>Volumen</th></tr></thead><tbody>${rows}</tbody></table></details></div>`;
}
function sessionRow(s) {
  const setTxt = x => `${x.kg ? fmt(x.kg) + '×' : ''}${x.reps}${x.rir != null ? '@' + x.rir : ''}`;
  const lines = Object.values(s.entries || {}).map(e => `<div class="kv"><span class="mut">${esc(e.name)}:</span> ${esc((e.sets || []).map(setTxt).join(', '))}</div>`).join('');
  const wk = s.week ?? 0;
  return `<div class="sess"><div class="row"><div class="sp"><b>${fdate(s.date)}</b> · ${esc(s.dayName || '')}<div class="mut small mono">Ciclo ${s.cycle || 1} · S${wk + 1} ${esc(s.phase || PHASES[wk] || '')}</div></div>
    ${confirmBtn('s' + s.id, 'delsess', `data-id="${s.id}"`, 'Borrar sesión')}</div>
    <div class="mt6">${lines}</div></div>`;
}
/* ---------- ventana de confirmación ---------- */
function openModal(title, bodyHtml, okLabel) {
  closeModal();
  const m = document.createElement('div'); m.id = 'modal';
  m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><p class="mut small">${bodyHtml}</p>
    <div class="row mt12"><button class="btn ghost sp" data-act="impcancel">Cancelar</button><button class="btn pri sp" data-act="impok">${esc(okLabel)}</button></div></div>`;
  document.body.appendChild(m);
}
function closeModal() { const m = $('#modal'); if (m) m.remove(); }
