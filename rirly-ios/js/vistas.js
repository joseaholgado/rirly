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
  $('#wkchip').innerHTML = cycleOver() ? '<b>Ciclo terminado</b>' : `S${w + 1}/${c.weeks} · <b>${PHASES[w]}</b>`;
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
  html += warmupCard(day.type);
  day.exercises.forEach((exo, idx) => { html += exerciseCard(day, exo, idx, plans[idx], dr.entries[exo.id]); });
  return html;
}
function bannerHoy(w, ups) {
  const c = S.cfg;
  let html = '';
  if (cycleOver()) html += `<div class="banner info"><b>Has terminado las ${c.weeks} semanas.</b> Empieza el ciclo nuevo: te subo 2,5 kg en torso y 5 kg en pierna donde completaste la S7.<br><button class="btn sm pri mt8" data-act="newcycle">Empezar ciclo nuevo</button></div>`;
  if (w === c.weeks - 1) return html + `<div class="banner dl"><b>Semana ${w + 1} · Descarga.</b> Mitad de series, RIR 4–5 y la carga de la S1.</div>`;
  if (ups) return html + `<div class="banner up"><b>Semana ${w + 1} · ${PHASES[w]}.</b> He reconfigurado tu sesión: <b>${ups}</b> ejercicio${ups > 1 ? 's suben' : ' sube'} de peso (⬆). Todo está precargado; cambia lo que quieras.</div>`;
  return html + `<div class="banner info"><b>Semana ${w + 1} · ${PHASES[w]}.</b> Sesión precargada con lo que toca. Marca ✓ cada serie hecha o corrige los números.</div>`;
}
function warmupCard(type) {
  const items = WARMUP.filter(x => x[2] === 'all' || x[2] === type);
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
  <p class="mut small mb0">RIR por semana: 8 valores entre 0 y 5; la D es la descarga (ej. 3·3·2·2·2·1·1·D). Tipo: carga, lastre, peso corporal, isometría o % de banca.</p></div>`;
  c.days.forEach(day => {
    html += `<div class="card"><div class="row"><input class="bold" data-p="dayname" data-d="${day.id}" value="${esc(day.name)}">
      <select class="w-auto" data-p="daytype" data-d="${day.id}">${opt('torso', 'Torso', day.type === 'torso')}${opt('pierna', 'Pierna', day.type === 'pierna')}</select>
      ${confirmBtn('day' + day.id, 'delday', `data-d="${day.id}"`, 'Borrar día')}</div>`;
    day.exercises.forEach((exo, i) => { html += exerciseEditor(day, exo, i); });
    html += `<button class="btn sm mt12" data-act="addex" data-d="${day.id}">+ Ejercicio</button></div>`;
  });
  return html + `<button class="btn full" data-act="addday">+ Añadir día</button>`;
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
    <div class="mt8">${field('RIR S1 → S8', `<input class="mono" data-p="seq" ${a} value="${esc(exo.seq)}">`)}</div>
    <div class="mt8">${field('Enlace al vídeo (vacío = búsqueda en YouTube)', `<input data-p="link" ${a} value="${esc(exo.link)}" placeholder="https://…" inputmode="url">`)}</div>
    <div class="row mt8"><input data-p="notes" ${a} value="${esc(exo.notes)}" placeholder="Nota">
      ${confirmBtn('ex' + exo.id, 'delex', a, 'Borrar ejercicio')}</div>
  </div>`;
}

/* ---------- Ciclo ---------- */
function viewCiclo() {
  const c = S.cfg, w = curWeek(), over = cycleOver();
  const weeks = PHASES.map((ph, i) => `<div class="w ${i === w && !over ? 'cur' : ''}">
      <div class="wl">S${i + 1}${i === w && !over ? ' ●' : ''}</div><div>${ph}<div class="mut small">${fdate(addDays(c.cycleStart, i * 7))} – ${fdate(addDays(c.cycleStart, i * 7 + 6))}</div></div>
      ${i !== w ? `<button class="btn sm ghost" data-act="setwk" data-i="${i}">Ir</button>` : '<span></span>'}</div>`).join('');
  return `<h2>Ciclo ${c.cycle}</h2>
  <div class="card"><div class="grid2"><div><label class="f">Empezó el lunes</label><input type="date" data-g="cycleStart" value="${esc(c.cycleStart)}"></div>
    <div class="end"><span class="mut small">La semana cambia sola cada lunes.</span></div></div>
    <div class="weeks mt10">${weeks}</div>
    <button class="btn full pri mt14" data-act="newcycle">Empezar ciclo nuevo</button>
    <p class="mut small">Al empezar ciclo: +2,5 kg torso y +5 kg pierna sobre tu S1 en los ejercicios donde completaste la S7.</p></div>

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
  if (UI.histEx) {
    const pts = historyOf(UI.histEx).filter(h => !h.deload).reverse();
    html += `<div class="card"><label class="f">Progreso de fuerza (e1RM estimado)</label>
    <select data-act="histex">${[...exMap].map(([id, n]) => opt(id, n, id === UI.histEx)).join('')}</select>${chart(pts)}</div>`;
  }
  html += '<div class="card">' + ss.map(sessionRow).join('') + '</div>';
  return html;
}
function sessionRow(s) {
  const setTxt = x => `${x.kg ? fmt(x.kg) + '×' : ''}${x.reps}${x.rir != null ? '@' + x.rir : ''}`;
  const lines = Object.values(s.entries || {}).map(e => `<div class="kv"><span class="mut">${esc(e.name)}:</span> ${esc((e.sets || []).map(setTxt).join(', '))}</div>`).join('');
  const wk = s.week ?? 0;
  return `<div class="sess"><div class="row"><div class="sp"><b>${fdate(s.date)}</b> · ${esc(s.dayName || '')}<div class="mut small mono">Ciclo ${s.cycle || 1} · S${wk + 1} ${PHASES[wk] || ''}</div></div>
    ${confirmBtn('s' + s.id, 'delsess', `data-id="${s.id}"`, 'Borrar sesión')}</div>
    <div class="mt6">${lines}</div></div>`;
}
function chart(pts) {
  if (pts.length < 2) return `<p class="mut small">Con 2 sesiones de este ejercicio verás la curva.</p>`;
  const W = 320, H = 120, pad = 22, vals = pts.map(p => p.e), mn = Math.min(...vals), mx = Math.max(...vals), rg = (mx - mn) || 1;
  const xy = pts.map((p, i) => [pad + i * (W - pad * 2) / (pts.length - 1), H - pad - (p.e - mn) / rg * (H - pad * 2)]);
  const d = vals[vals.length - 1] - vals[0];
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" class="mt10" role="img" aria-label="Evolución del e1RM">
    <polyline class="ch-line" points="${xy.map(p => p.join(',')).join(' ')}"/>
    ${xy.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" class="ch-dot"/>`).join('')}
    <text x="${pad}" y="14" class="ch-txt">${fmt(round1(mx))} kg</text>
    <text x="${pad}" y="${H - 4}" class="ch-txt">${fmt(round1(mn))} kg</text></svg>
    <div class="row small"><span class="mut">${fmt(round1(vals[0]))} → ${fmt(round1(vals[vals.length - 1]))} kg</span><span class="sp"></span><b class="${d >= 0 ? 'c-ok' : 'c-warn'}">${d >= 0 ? '+' : ''}${fmt(round1(d))} kg</b></div>`;
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
