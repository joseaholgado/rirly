"use strict";
/* ============================================================
   util.js · utilidades generales (DOM, fechas, números, texto)
   ============================================================ */

const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
const clone = o => JSON.parse(JSON.stringify(o));
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);

/** Escapa texto para meterlo en HTML (contenido y atributos). */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- fechas (cadenas AAAA-MM-DD en hora local) ---------- */
// Se usa el mediodía para que los cambios de horario no muevan el día.
const isoDate = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const today = () => isoDate(new Date());
const noon = ds => new Date(ds + 'T12:00:00');
const mondayOf = ds => { const d = noon(ds); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return isoDate(d); };
const addDays = (ds, n) => { const d = noon(ds); d.setDate(d.getDate() + n); return isoDate(d); };
const daysBetween = (a, b) => Math.round((noon(b) - noon(a)) / 864e5);
const fdate = ds => noon(ds).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

/* ---------- números ---------- */
/** Formato español: 82.5 → "82,5". Vacío si no es un número. */
const fmt = x => { if (x === '' || x == null || isNaN(x)) return ''; return String(Math.round(x * 100) / 100).replace('.', ','); };
/** Lee un número escrito con coma o punto. NaN si está vacío. */
const num = v => { if (v === '' || v == null) return NaN; return parseFloat(String(v).replace(',', '.')); };
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const roundTo = (x, inc) => Math.round(Math.round(x / inc) * inc * 100) / 100;
const round1 = x => Math.round(x * 10) / 10;

/** Vuelve arriba en la zona de contenido (la página en sí no se desplaza). */
const resetScroll = () => { const s = $('.stage'); if (s) s.scrollTop = 0; };

/* ---------- aviso flotante ---------- */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600);
}
