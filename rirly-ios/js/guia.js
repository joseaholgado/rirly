"use strict";
/* ============================================================
   guia.js · guía paso a paso para quien usa la app por primera vez
   Sin librerías externas: funciona sin conexión y respeta la CSP
   (las posiciones se fijan con element.style, que la CSP permite).
   ============================================================ */

/* Cada paso: { title, text, sel?, tab?, when? }
   sel  → elemento a resaltar (sin sel: globo centrado). Si no existe, el paso se salta.
   tab  → pestaña que se abre antes de mostrar el paso.
   when → condición para incluir el paso. */
const GUIDES = {
  intro: [
    { title: '👋 Bienvenido a RIRLY', text: 'Esta app te dice qué peso poner en cada serie según cómo te fue la semana anterior. Te enseño lo básico en un minuto.' },
    { title: '¿Qué es el RIR?', text: 'RIR = repeticiones en recámara: cuántas reps más podrías haber hecho al acabar la serie. RIR 2 significa que te quedaban 2. Cada semana el programa te marca un RIR objetivo.' },
    { sel: '#tabs', title: 'Las 4 pestañas', text: 'Entrenar: la sesión de hoy. Programa: tus días y ejercicios. Ciclo: semanas, normas y copias. Historial: tus sesiones y tu progreso.' },
    { sel: '.wk', title: 'Tu semana', text: 'El ciclo dura 8 semanas y avanza solo cada lunes; la última es de descarga. Con las flechas te mueves si te saltaste o adelantaste una.' },
    { sel: '.empty .btn.pri', tab: 'hoy', when: () => !S.cfg.days.length, title: 'Carga tu plan', text: 'Importa el archivo de plan que te hayan pasado. También puedes crearlo a mano en Programa.' },
    { sel: '[data-act="exportfile"]', tab: 'bloque', title: 'Haz copias de seguridad', text: 'Todo se guarda solo en este móvil. Exporta una copia de vez en cuando (Archivos, iCloud o Google Drive) para no perder nada si cambias de móvil.' },
    { tab: 'hoy', title: '¡Listo!', text: 'Puedes volver a ver esta guía cuando quieras en Ciclo › Ver guía.' }
  ],
  session: [
    { sel: '.chips', tab: 'hoy', title: 'Elige el día', text: 'Toca el día que vas a entrenar. Un punto • indica que tienes esa sesión a medias.' },
    { sel: '.card[id^="card-"] .sug', title: 'Lo que toca hoy', text: 'Peso × reps que te propongo. La primera vez no hay historial: elige un peso con el que llegues al RIR indicado y a partir de ahí lo calculo yo.' },
    { sel: '.card[id^="card-"] .sets', title: 'Tus series', text: 'Vienen precargadas (en gris). Corrige los kg y las reps si hace falta, apunta el RIR real que te quedó y marca ✓ al terminar cada serie.' },
    { sel: '.card[id^="card-"] .link', title: 'Vídeo', text: 'Cómo se hace el ejercicio. Si no tiene enlace propio, abre una búsqueda en YouTube.' },
    { sel: '#foot .btn.pri', title: 'Guardar sesión', text: 'Al terminar, guarda. La próxima vez te recalculo los pesos con lo que hiciste.' }
  ]
};

const Guide = {
  name: null, steps: null, i: 0, el: null, target: null,

  /* ---------- qué guías se han visto (aparte de los datos: no va en las copias) ---------- */
  seen() { const s = Store.get('fz_guide'); return isObj(s) ? s : {}; },
  mark(name) { const s = this.seen(); s[name] = true; try { localStorage.setItem('fz_guide', JSON.stringify(s)); } catch (e) { /* sin espacio: no pasa nada */ } },
  active() { return !!this.steps; },

  /** Se llama tras cada render: lanza la guía que toque si nunca se ha visto. */
  maybeStart() {
    if (this.active() || $('#modal')) return;
    const seen = this.seen();
    if (!seen.intro) this.start('intro');
    else if (!seen.session && UI.tab === 'hoy' && S.cfg.days.length) this.start('session');
  },
  start(name) {
    this.close();
    this.name = name;
    this.steps = GUIDES[name].filter(s => !s.when || s.when());
    this.i = 0;
    this.el = document.createElement('div');
    this.el.id = 'tour';
    this.el.innerHTML = `<div class="tour-spot"></div><div class="tour-box" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div class="tour-count mut small"></div><h3 id="tour-title"></h3><p class="tour-text"></p>
      <div class="row"><button class="btn ghost sm" data-tour="skip">Saltar</button><span class="sp"></span>
      <button class="btn sm" data-tour="prev">Atrás</button><button class="btn pri sm" data-tour="next">Siguiente</button></div></div>`;
    document.body.appendChild(this.el);
    this.show(1);
  },
  /** Muestra el paso actual; dir indica hacia dónde saltar si el elemento no existe. */
  show(dir) {
    while (this.i >= 0 && this.i < this.steps.length) {
      const st = this.steps[this.i];
      if (st.tab && UI.tab !== st.tab) { UI.tab = st.tab; UI.confirm = null; render(); }
      this.target = st.sel ? $(st.sel) : null;
      if (!st.sel || this.target) break;
      this.i += dir;   // el elemento no está en pantalla: siguiente paso
    }
    if (this.i < 0) { this.i = 0; return this.show(1); }
    if (this.i >= this.steps.length) return this.finish();
    const st = this.steps[this.i], last = this.i === this.steps.length - 1;
    this.el.querySelector('.tour-count').textContent = `${this.i + 1} / ${this.steps.length}`;
    this.el.querySelector('#tour-title').textContent = st.title;
    this.el.querySelector('.tour-text').textContent = st.text;
    this.el.querySelector('[data-tour="prev"]').hidden = this.i === 0;
    this.el.querySelector('[data-tour="next"]').textContent = last ? (this.name === 'intro' ? 'Empezar' : 'Entendido') : 'Siguiente';
    if (this.target) this.target.scrollIntoView({ block: 'center' });
    this.place();
    this.el.querySelector('[data-tour="next"]').focus({ preventScroll: true });
  },
  /** Coloca el resaltado sobre el elemento y el globo debajo (o encima si no cabe). */
  place() {
    if (!this.el) return;
    const spot = this.el.querySelector('.tour-spot'), box = this.el.querySelector('.tour-box');
    const vw = window.innerWidth, vh = window.innerHeight, m = 12;
    this.el.classList.toggle('centered', !this.target);
    if (!this.target) { box.style.left = ''; box.style.top = ''; return; }
    const r = this.target.getBoundingClientRect(), pad = 6;
    Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const bw = box.offsetWidth, bh = box.offsetHeight;
    const below = r.bottom + pad + m, above = r.top - pad - m - bh;
    const top = below + bh <= vh - m ? below : (above >= m ? above : Math.max(m, vh - bh - m));
    box.style.left = clamp(r.left + r.width / 2 - bw / 2, m, vw - bw - m) + 'px';
    box.style.top = top + 'px';
  },
  next() { this.i++; this.show(1); },
  prev() { this.i--; this.show(-1); },
  skip() { this.mark(this.name); this.close(); },
  finish() {
    const name = this.name;
    this.mark(name); this.close();
    // tras la bienvenida, si ya hay plan, se explica la sesión
    if (name === 'intro') {
      UI.tab = 'hoy'; render();
      if (S.cfg.days.length && !this.active()) this.start('session');
    }
  },
  close() { if (this.el) this.el.remove(); this.el = null; this.steps = null; this.target = null; }
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-tour]'); if (!b || !Guide.active()) return;
  ({ next: () => Guide.next(), prev: () => Guide.prev(), skip: () => Guide.skip() })[b.dataset.tour]?.();
});
document.addEventListener('keydown', e => {
  if (!Guide.active()) return;
  if (e.key === 'Escape') Guide.skip();
  else if (e.key === 'ArrowRight') Guide.next();
  else if (e.key === 'ArrowLeft') Guide.prev();
});
window.addEventListener('resize', () => Guide.place());
