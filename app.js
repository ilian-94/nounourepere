/* NounouRepère — application de suivi pour assistante maternelle (version 2.0).
 * Tout fonctionne dans le téléphone : aucune donnée n'est envoyée sur Internet.
 * Données : localStorage, clé « nounourepere.v1 ».
 *
 * Organisation :
 *   1. Données, stockage, migration     5. Saisie (feuille), annulation, bilan du jour
 *   2. Dates et formats                 6. Dialogues, bienvenue, taille du texte
 *   3. Contrat daté (horaires A/B)      7. Export, sauvegarde, événements, démarrage
 *   4. Règles de décompte et écrans
 * Modules séparés : paie.js (paie estimée), fiscal.js (abattement), mois.js (fiche du mois), regles.js (sources).
 */
'use strict';

/* ======================= 1. Données et stockage ======================= */

const STORE_KEY = 'nounourepere.v1';
const DATA_VERSION = 2;

const DEFAULT_SETTINGS = {
  congesMode: 'non_compte',   // congés : 'non_compte' | 'compte' | 'deduit'
  presenceAuto: true,         // jour prévu passé sans saisie = présence selon le planning
  afficherFeries: true,
  feriesMode: 'chome',        // jour férié sans saisie : 'chome' | 'travaille'
  textSize: 'normal',         // 'normal' | 'grand' | 'tres_grand'
  onboarded: false,
  lastBackup: null,
};

let state = load();

function emptyState() {
  return { version: DATA_VERSION, children: [], entries: [], settings: { ...DEFAULT_SETTINGS } };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalize(JSON.parse(raw)) : emptyState();
  } catch (e) { console.error(e); return emptyState(); }
}
/** Normalise et migre les données (v1 → v2 : horaires et tarifs deviennent des versions datées du contrat). */
function normalize(data) {
  const s = emptyState();
  if (!data || typeof data !== 'object') return s;
  s.children = Array.isArray(data.children) ? data.children : [];
  s.entries = Array.isArray(data.entries) ? data.entries : [];
  s.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  if (data.children && data.children.length && data.settings && data.settings.onboarded === undefined) s.settings.onboarded = true;
  for (const c of s.children) {
    if (!Array.isArray(c.versions) || !c.versions.length) {
      c.versions = [{ from: c.debut, horaires: c.horaires || {}, horairesB: null, refA: null, semainesContrat: c.semainesContrat || '', tarif: c.tarif || {} }];
    }
    delete c.horaires; delete c.tarif; delete c.semainesContrat;
    c.versions.sort((a, b) => a.from.localeCompare(b.from));
    c.declared = c.declared || {};
  }
  return s;
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { showDialog({ title: 'Enregistrement impossible', message: 'Le stockage du téléphone est plein ou bloqué. Faites une sauvegarde depuis Réglages.', ok: 'Compris', cancel: null }); }
  rebuildIndex();
}

let entryIndex = new Map();
function rebuildIndex() {
  entryIndex = new Map();
  for (const e of state.entries) entryIndex.set(e.childId + '|' + e.date, e);
}
rebuildIndex();

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const childById = (id) => state.children.find((c) => c.id === id);
const entryFor = (childId, ds) => entryIndex.get(childId + '|' + ds);

function setEntry(childId, ds, data) {
  removeEntry(childId, ds, true);
  state.entries.push({ id: uid(), childId, date: ds, ...data, savedAt: new Date().toISOString() });
  entryIndex.set(childId + '|' + ds, state.entries[state.entries.length - 1]);
}
function removeEntry(childId, ds, silent) {
  state.entries = state.entries.filter((e) => !(e.childId === childId && e.date === ds));
  entryIndex.delete(childId + '|' + ds);
  if (!silent) save();
}

/* ======================= 2. Dates et formats ======================= */

const pad = (n) => String(n).padStart(2, '0');
const fromDS = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const toDS = (d) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
const addDays = (s, n) => { const d = fromDS(s); d.setUTCDate(d.getUTCDate() + n); return toDS(d); };
const todayDS = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const isoWd = (s) => { const w = fromDS(s).getUTCDay(); return w === 0 ? 7 : w; }; // 1 = lundi … 7 = dimanche
const mondayOf = (s) => addDays(s, 1 - isoWd(s));
const monthFirst = (y, m) => `${y}-${pad(m)}-01`;
const monthLast = (y, m) => toDS(new Date(Date.UTC(y, m, 0)));
const minDS = (a, b) => (a < b ? a : b);
const maxDS = (a, b) => (a > b ? a : b);
function* eachDay(from, to) { for (let d = from; d <= to; d = addDays(d, 1)) yield d; }

const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const JOURS_COURTS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const fmtDate = (s, opt = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat('fr-FR', { ...opt, timeZone: 'UTC' }).format(fromDS(s));
const fmtLong = (s) => fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShortYear = (s) => fmtDate(s, { day: 'numeric', month: 'short', year: 'numeric' });

function fmtH(h) {
  const neg = h < 0;
  const m = Math.round(Math.abs(h) * 60);
  const txt = m % 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m / 60} h`;
  return (neg ? '−' : '') + txt;
}
const hDecimal = (h) => (Math.round(h * 100) / 100).toString().replace('.', ',');
const plural = (n, one, many) => `${n} ${n > 1 || n === 0 ? many : one}`;
const jours = (n) => plural(n, 'journée', 'journées');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const timeToMin = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function hoursBetween(a, d) {
  const x = timeToMin(a), y = timeToMin(d);
  if (x == null || y == null || y <= x) return 0;
  return (y - x) / 60;
}

// Jours fériés français
const feriesCache = {};
function feries(y) {
  if (feriesCache[y]) return feriesCache[y];
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const paques = `${y}-${pad(month)}-${pad(day)}`;
  return (feriesCache[y] = new Map([
    [`${y}-01-01`, "Jour de l'an"], [addDays(paques, 1), 'Lundi de Pâques'], [`${y}-05-01`, 'Fête du Travail'],
    [`${y}-05-08`, 'Victoire 1945'], [addDays(paques, 39), 'Ascension'], [addDays(paques, 50), 'Lundi de Pentecôte'],
    [`${y}-07-14`, 'Fête nationale'], [`${y}-08-15`, 'Assomption'], [`${y}-11-01`, 'Toussaint'],
    [`${y}-11-11`, 'Armistice 1918'], [`${y}-12-25`, 'Noël'],
  ]));
}
const ferieName = (ds) => (state.settings.afficherFeries ? feries(+ds.slice(0, 4)).get(ds) : null);

/* ======================= 3. Contrat daté (horaires A/B, tarifs) =======================
 * Chaque enfant a une liste de « versions » du contrat, chacune valable à partir d'une date :
 *   { from, horaires, horairesB (ou null), refA (lundi d'une semaine A), semainesContrat, tarif }
 * Un changement (avenant) crée une nouvelle version : les mois passés gardent les anciennes valeurs.
 */
function versionAt(c, ds) {
  let v = c.versions[0];
  for (const x of c.versions) if (x.from <= ds) v = x;
  return v;
}
const refDate = (c) => (isActive(c) ? todayDS() : (c.debut > todayDS() ? c.debut : (c.fin || todayDS())));
const currentVersion = (c) => versionAt(c, refDate(c));
const lastVersion = (c) => c.versions[c.versions.length - 1];
function isWeekB(v, ds) {
  if (!v.horairesB) return false;
  const ref = mondayOf(v.refA || v.from);
  const weeks = Math.round((fromDS(mondayOf(ds)) - fromDS(ref)) / (7 * 864e5));
  return Math.abs(weeks) % 2 === 1;
}
/** Horaire prévu un jour donné : { a, d } ou null. */
function slotAt(c, ds) {
  const v = versionAt(c, ds);
  const grid = isWeekB(v, ds) ? v.horairesB : v.horaires;
  const h = grid && grid[isoWd(ds)];
  return h && h.on && hoursBetween(h.a, h.d) > 0 ? h : null;
}
const plannedAt = (c, ds) => { const s = slotAt(c, ds); return s ? hoursBetween(s.a, s.d) : 0; };
const gridHours = (grid) => [1, 2, 3, 4, 5, 6, 7].reduce((s, wd) => s + (grid && grid[wd] && grid[wd].on ? hoursBetween(grid[wd].a, grid[wd].d) : 0), 0);
const gridDays = (grid) => [1, 2, 3, 4, 5, 6, 7].filter((wd) => grid && grid[wd] && grid[wd].on && hoursBetween(grid[wd].a, grid[wd].d) > 0).length;
/** Heures hebdomadaires moyennes d'une version (moyenne A/B si alternance). */
const versionWeeklyHours = (v) => (v.horairesB ? (gridHours(v.horaires) + gridHours(v.horairesB)) / 2 : gridHours(v.horaires));
const versionWeeklyDays = (v) => (v.horairesB ? (gridDays(v.horaires) + gridDays(v.horairesB)) / 2 : gridDays(v.horaires));
const weeklyHours = (c, ds) => versionWeeklyHours(ds ? versionAt(c, ds) : currentVersion(c));

const inContract = (child, ds) => ds >= child.debut && (!child.fin || ds <= child.fin);
const isActive = (child, ds = todayDS()) => child.debut <= ds && (!child.fin || child.fin >= ds);

/* ======================= 4. Règles de décompte =======================
 * Règle n°1 : absence de l'enfant un jour prévu  → la journée COMPTE (payée). Exception : maladie justifiée,
 *             si les parents appliquent la retenue (case cochée sur la saisie).
 * Règle n°2 : absence de la nounou                → la journée est RETIRÉE (déduite, sauf absence rémunérée).
 */
const TYPES = {
  presence:       { label: 'Présent', long: "L'enfant était là", ic: '✓', help: 'Heures réelles et kilomètres facultatifs.' },
  absence_enfant: { label: 'Enfant absent', long: "L'enfant était absent", ic: '🧒', help: 'Journée payée et comptée comme travaillée.' },
  absence_am:     { label: 'Nounou absente', long: 'Vous étiez absente', ic: '👩', help: 'Journée retirée et déduite du salaire (sauf absence rémunérée).' },
  conges:         { label: 'Congés', long: 'Congés', ic: '🌴', help: 'Vos congés ou ceux de la famille. Jamais déduits du salaire.' },
};
const STATUS_LABEL = {
  presence: 'Présent', presence_auto: 'Présent (prévu)', ferie: 'Férié', absence_enfant: 'Enfant absent',
  absence_am: 'Nounou absente', conges: 'Congés', prevu: 'Prévu', non_prevu: 'Pas d’accueil', hors: 'Hors contrat',
};
const STATUS_IC = { presence: '✓', presence_auto: '✓', ferie: '★', absence_enfant: '🧒', absence_am: '👩', conges: '🌴', prevu: '·', non_prevu: '', hors: '' };

/** État d'une journée pour un enfant. Toutes les règles de décompte sont ici. */
function dayInfo(child, ds, today = todayDS()) {
  const r = { ds, status: 'non_prevu', planned: 0, real: 0, retained: 0, deducted: 0, maintained: 0, extra: 0,
    counted: false, deductedDay: false, effective: false, entry: null, km: 0 };
  if (!inContract(child, ds)) { r.status = 'hors'; return r; }
  r.planned = plannedAt(child, ds);
  const e = entryFor(child.id, ds);
  r.entry = e || null;
  if (e) {
    switch (e.type) {
      case 'presence': {
        const real = e.a && e.d ? hoursBetween(e.a, e.d) : r.planned;
        r.status = 'presence'; r.real = real; r.effective = true; r.counted = true;
        r.retained = Math.max(real, r.planned);    // départ anticipé : heures prévues comptées ; plus long : heures en plus
        r.extra = Math.max(0, real - r.planned);
        r.km = +e.km || 0;
        break;
      }
      case 'absence_enfant':
        r.status = 'absence_enfant';
        if (e.retenue) { r.nonRemu = true; break; }
        if (r.planned > 0) { r.counted = true; r.retained = r.planned; r.maintained = r.planned; }
        break;
      case 'absence_am':
        r.status = 'absence_am';
        r.remuneree = !!e.remuneree;
        if (r.planned > 0) { r.deductedDay = true; r.deducted = r.planned; }
        break;
      case 'conges': {
        r.status = 'conges';
        const mode = state.settings.congesMode;
        if (r.planned > 0 && mode === 'compte') { r.counted = true; r.retained = r.planned; }
        if (r.planned > 0 && mode === 'deduit') { r.deductedDay = true; r.deducted = r.planned; }
        break;
      }
    }
    return r;
  }
  if (r.planned <= 0) return r;
  if (state.settings.feriesMode !== 'travaille' && feries(+ds.slice(0, 4)).has(ds)) { r.status = 'ferie'; return r; }
  if (ds <= today && state.settings.presenceAuto) {
    r.status = 'presence_auto'; r.real = r.planned; r.retained = r.planned; r.counted = true; r.effective = true;
    return r;
  }
  r.status = 'prevu';
  return r;
}

function totals(child, from, to, today = todayDS()) {
  const t = { heuresPrevues: 0, joursPrevus: 0, heuresRealisees: 0, heuresRetenues: 0, heuresSupp: 0, heuresDeduites: 0, heuresMaintenues: 0,
    joursComptes: 0, joursPresence: 0, joursAbsEnfant: 0, joursAbsEnfantNonRemu: 0, joursFeries: 0, joursAbsAM: 0, joursConges: 0, joursSupp: 0,
    joursAVenir: 0, joursAConfirmer: 0, semainesEcoulees: 0, semainesComptees: 0, semainesEffectives: 0, km: 0 };
  const start = maxDS(from, child.debut);
  const end = child.fin ? minDS(to, child.fin) : to;
  if (start > end) return t;
  const wkElapsed = new Set(), wkCounted = new Set(), wkEff = new Set();
  for (const ds of eachDay(start, end)) {
    const r = dayInfo(child, ds, today);
    const wk = mondayOf(ds);
    if (ds <= today) wkElapsed.add(wk);
    if (r.planned > 0) { t.joursPrevus++; t.heuresPrevues += r.planned; }
    if (r.status === 'prevu') { if (ds < today) t.joursAConfirmer++; else t.joursAVenir++; }
    t.heuresRealisees += r.real; t.heuresRetenues += r.retained; t.heuresSupp += r.extra;
    t.heuresDeduites += r.deducted; t.heuresMaintenues += r.maintained; t.km += r.km;
    if (r.counted) { t.joursComptes++; wkCounted.add(wk); }
    if (r.effective) wkEff.add(wk);
    if (r.status === 'presence' || r.status === 'presence_auto') { t.joursPresence++; if (r.planned <= 0) t.joursSupp++; }
    if (r.status === 'absence_enfant' && r.planned > 0) { if (r.nonRemu) t.joursAbsEnfantNonRemu++; else t.joursAbsEnfant++; }
    if (r.status === 'absence_am' && r.deductedDay) t.joursAbsAM++;
    if (r.status === 'conges' && r.planned > 0) t.joursConges++;
    if (r.status === 'ferie') t.joursFeries++;
  }
  t.semainesEcoulees = wkElapsed.size; t.semainesComptees = wkCounted.size; t.semainesEffectives = wkEff.size;
  return t;
}
const periodTotals = {
  week: (c, anchor) => { const m = mondayOf(anchor); return totals(c, m, addDays(m, 6)); },
  month: (c, y, m) => totals(c, monthFirst(y, m), monthLast(y, m)),
  year: (c, y) => totals(c, `${y}-01-01`, `${y}-12-31`),
};
function weeksSinceStart(child, today = todayDS()) {
  const end = child.fin ? minDS(child.fin, today) : today;
  if (child.debut > end) return 0;
  return Math.round((fromDS(mondayOf(end)) - fromDS(mondayOf(child.debut))) / (7 * 864e5)) + 1;
}

/* ---------- Éléments d'interface communs ---------- */
const app = document.getElementById('app');
const COLORS = ['#537B68', '#8A5A83', '#2F6F84', '#B5653F', '#5C6BA8', '#7B7A2E', '#A0475B', '#3E7D74'];
const childColor = (c) => COLORS[Math.max(0, state.children.indexOf(c)) % COLORS.length];
const avatar = (c, sm) => `<span class="avatar${sm ? ' sm' : ''}" style="background:${childColor(c)}" aria-hidden="true">${esc((c.prenom || '?').trim().charAt(0).toUpperCase())}</span>`;
function statusLabel(r) {
  if (r.status === 'absence_enfant' && r.nonRemu) return 'Enfant absent · non payé';
  if (r.status === 'absence_am' && r.remuneree) return 'Nounou absente · payée';
  return STATUS_LABEL[r.status];
}
const badge = (status, label) => `<span class="badge t-${status}"><span class="ic" aria-hidden="true">${STATUS_IC[status] || ''}</span>${esc(label || STATUS_LABEL[status])}</span>`;
const sortedChildren = () => [...state.children].sort((a, b) => (isActive(b) - isActive(a)) || a.prenom.localeCompare(b.prenom, 'fr'));
const slotText = (s) => (s ? `${s.a} → ${s.d}` : 'Pas d’accueil');

const ui = {
  calView: 'mois', calDate: todayDS(), calChild: 'all',
  childPeriod: 'month', childAnchor: todayDS(),
  recapYear: +todayDS().slice(0, 4), recapChild: 'all', recapMonth: 0,
  formStep: 1,
};

function setTitle(title, sub) {
  document.getElementById('pageTitle').textContent = sub ? title : '';
  document.body.classList.toggle('subpage', !!sub);
  document.title = title === 'NounouRepère' ? title : `${title} — NounouRepère`;
}

const NO_FAB = new Set(['nouvel-enfant', 'recap', 'reglages', 'regles', 'mois']);
function route(opts = {}) {
  if (!opts.keepSheet) closeSheet();
  const parts = (location.hash.replace(/^#\/?/, '') || 'accueil').split('/');
  const page = parts[0];
  document.querySelectorAll('.bottomnav a').forEach((a) => {
    const n = a.dataset.nav;
    const active = n === page || (n === 'enfants' && ['enfant', 'nouvel-enfant', 'mois'].includes(page)) || (n === 'reglages' && page === 'regles');
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.body.classList.toggle('no-fab', NO_FAB.has(page) || (page === 'enfant' && parts[2] === 'modifier'));
  const y = window.scrollY;
  switch (page) {
    case 'enfants': renderChildren(); break;
    case 'enfant': parts[2] === 'modifier' ? renderChildForm(parts[1]) : renderChild(parts[1]); break;
    case 'nouvel-enfant': renderChildForm(null); break;
    case 'calendrier': renderCalendar(); break;
    case 'recap': renderRecap(); break;
    case 'reglages': renderSettings(); break;
    case 'regles': renderRules(); break;
    case 'mois': renderMonthSheet(parts[1], parts[2]); break;
    default: renderHome();
  }
  window.scrollTo(0, opts.keepScroll ? y : 0);
}
const refresh = () => route({ keepScroll: true });

/* ---------- Accueil ---------- */
function renderHome() {
  setTitle('NounouRepère', false);
  const today = todayDS();
  const [y, m] = today.split('-').map(Number);
  const actifs = sortedChildren().filter((c) => isActive(c));
  let h = `<p class="hello">Bonjour 👋 <span>${fmtLong(today)}</span></p>`;

  if (!state.children.length) {
    h += `<div class="card empty"><img src="icons/icon.svg" alt="">
      <h2 style="justify-content:center">Bienvenue dans NounouRepère</h2>
      <p>Commencez par créer la fiche d'un enfant : ses jours et horaires servent à tous les calculs.</p>
      <a class="btn primary block" href="#/nouvel-enfant">Ajouter un enfant</a></div>`;
    app.innerHTML = h + backupReminder();
    return;
  }

  // Aujourd'hui : saisie en un geste
  const prevus = actifs.filter((c) => plannedAt(c, today) > 0);
  h += `<h2 class="section-title">Aujourd'hui</h2><div class="card">`;
  if (!actifs.length) h += `<p>Aucun enfant accueilli actuellement.</p>`;
  for (const c of actifs) {
    const r = dayInfo(c, today, today);
    const s = slotAt(c, today);
    h += `<div class="todayrow"><a class="row" href="#/enfant/${c.id}" style="text-decoration:none;color:inherit">${avatar(c, true)}
        <span class="grow"><span class="child-name">${esc(c.prenom)}</span><br><small>${slotText(s)}</small></span>${badge(r.status, statusLabel(r))}</a>`;
    if (r.planned > 0 || r.entry) {
      h += `<div class="quickrow">
        ${quickBtn('presence', c, today, r)}${quickBtn('absence_enfant', c, today, r)}
        <button class="qb t-prevu" data-act="open-entry" data-type="presence" data-id="${c.id}" data-date="${today}" aria-label="Autres choix pour ${esc(c.prenom)}">⋯</button></div>`;
    }
    h += `</div>`;
  }
  if (prevus.length) {
    const toConfirm = prevus.filter((c) => !entryFor(c.id, today));
    h += `<div class="stack-btns">
      ${toConfirm.length ? `<button class="btn primary block" data-act="confirm-today">✓ Tout s'est passé comme prévu</button>` : ''}
      <button class="btn danger block" data-act="am-absent-today">👩 Je suis absente aujourd'hui</button></div>`;
  }
  h += `</div>`;

  // Jours passés à vérifier
  const pending = pendingDays(today, 14);
  if (pending.length) {
    h += `<h2 class="section-title">À vérifier <small class="muted">(${pending.length})</small></h2><div class="card">
      <p class="note">Jours passés sans saisie, comptés ${state.settings.presenceAuto ? 'comme une présence selon le planning' : '« prévus »'}. Confirmez-les ou corrigez-les.</p><ul class="list">`;
    for (const p of pending.slice(0, 6)) {
      h += `<li class="row wrap"><span class="grow"><strong>${esc(p.c.prenom)}</strong> · ${fmtDate(p.ds)}</span>
        <button class="btn small" data-act="confirm-day" data-id="${p.c.id}" data-date="${p.ds}">✓ Conforme</button>
        <button class="btn small" data-act="goto-day" data-date="${p.ds}">Modifier</button></li>`;
    }
    h += `</ul>${pending.length > 1 ? `<button class="btn block" style="margin-top:8px" data-act="confirm-pending">Tout confirmer comme prévu (${pending.length})</button>` : ''}</div>`;
  }

  // Ce mois-ci
  h += `<h2 class="section-title">Ce mois-ci <small class="muted">(${MOIS[m]})</small></h2>`;
  for (const c of actifs) {
    const t = periodTotals.month(c, y, m);
    h += `<a class="card monthline" href="#/enfant/${c.id}">${avatar(c, true)}<span class="grow"><span class="child-name">${esc(c.prenom)}</span><br>
      <small>${jours(t.joursComptes)} comptée${t.joursComptes > 1 ? 's' : ''}${t.joursAbsAM ? ` · ${t.joursAbsAM} déduite${t.joursAbsAM > 1 ? 's' : ''}` : ''}${t.joursAbsEnfant ? ` · ${t.joursAbsEnfant} absence${t.joursAbsEnfant > 1 ? 's' : ''} enfant` : ''}</small></span>
      ${homePay(c, y, m)}<span class="chev">›</span></a>`;
  }

  // À venir et récent
  const evts = upcoming(today);
  h += `<h2 class="section-title">À venir et récent</h2><div class="card">`;
  h += evts.length ? `<ul class="list">` + evts.slice(0, 8).map((e) => `<li class="row"><span class="evdate">${fmtDate(e.date)}</span><span class="grow">${e.txt}</span></li>`).join('') + `</ul>`
    : `<p class="muted">Rien de particulier.</p>`;
  h += `</div>` + backupReminder();
  app.innerHTML = h;
}
function quickBtn(type, c, ds, r) {
  const on = r.entry && r.entry.type === type;
  return `<button class="qb t-${type}${on ? ' on' : ''}" data-act="quick" data-type="${type}" data-id="${c.id}" data-date="${ds}" aria-pressed="${on}">${TYPES[type].ic} ${TYPES[type].label}</button>`;
}
function homePay(c, y, m) {
  if (!hasTarif(c)) return '';
  const p = payMonth(c, y, m);
  if (!p.ok) return '';
  return `<span class="paypill">${euro(p.net ? p.totalVerse : p.brut.total)}<small>${p.partiel ? 'à ce jour' : 'estimé'}</small></span>`;
}
/** Jours passés (hors aujourd'hui) prévus et sans saisie. */
function pendingDays(today, n) {
  const out = [];
  for (const c of sortedChildren()) {
    for (let i = n; i >= 1; i--) {
      const ds = addDays(today, -i);
      if (!inContract(c, ds) || entryFor(c.id, ds)) continue;
      const r = dayInfo(c, ds, today);
      if (r.status === 'presence_auto' || r.status === 'prevu') out.push({ c, ds });
    }
  }
  return out.sort((a, b) => a.ds.localeCompare(b.ds));
}
function groupAbsences(list) {
  const groups = [];
  const sorted = [...list].sort((a, b) => a.childId.localeCompare(b.childId) || a.type.localeCompare(b.type) || a.date.localeCompare(b.date));
  for (const e of sorted) {
    const g = groups[groups.length - 1];
    if (g && g.child.id === e.childId && g.type === e.type && (g.motif || '') === (e.motif || '') && nextPlannedGap(g.child, g.to, e.date)) g.to = e.date;
    else groups.push({ child: childById(e.childId), type: e.type, from: e.date, to: e.date, motif: e.motif });
  }
  return groups.sort((a, b) => a.from.localeCompare(b.from));
}
function nextPlannedGap(child, a, b) {
  for (let d = addDays(a, 1); d < b; d = addDays(d, 1)) if (plannedAt(child, d) > 0) return false;
  return true;
}
function upcoming(today) {
  const end = addDays(today, 45), out = [];
  for (const ds of eachDay(addDays(today, 1), end)) { const f = ferieName(ds); if (f) out.push({ date: ds, txt: `${badge('ferie', 'Férié')} ${f}` }); }
  for (const c of state.children) {
    if (c.debut > today && c.debut <= end) out.push({ date: c.debut, txt: `Début d'accueil de <strong>${esc(c.prenom)}</strong>` });
    if (c.fin && c.fin >= today && c.fin <= end) out.push({ date: c.fin, txt: `Fin d'accueil de <strong>${esc(c.prenom)}</strong>` });
    for (const v of c.versions.slice(1)) if (v.from > today && v.from <= end) out.push({ date: v.from, txt: `Nouveau contrat pour <strong>${esc(c.prenom)}</strong>` });
  }
  const abs = state.entries.filter((e) => e.type !== 'presence' && e.date >= addDays(today, -10) && e.date <= end && childById(e.childId));
  for (const g of groupAbsences(abs)) out.push({ date: g.from, txt: `${badge(g.type, TYPES[g.type].label)} ${esc(g.child.prenom)}${g.to !== g.from ? ` jusqu'au ${fmtDate(g.to)}` : ''}${g.motif ? ` <small>(${esc(g.motif)})</small>` : ''}` });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function backupReminder() {
  const lb = state.settings.lastBackup;
  const old = !lb || (Date.now() - new Date(lb).getTime()) > 30 * 864e5;
  if (!state.children.length || !old) return '';
  return `<div class="card warn"><strong>💾 Pensez à sauvegarder</strong>
    <p>Vos données sont uniquement dans ce téléphone. ${lb ? `Dernière sauvegarde : ${fmtShortYear(lb.slice(0, 10))}.` : 'Aucune sauvegarde pour l’instant.'}</p>
    <a class="btn small" href="#/reglages">Faire une sauvegarde</a></div>`;
}

/* ---------- Liste des enfants ---------- */
function renderChildren() {
  setTitle('Enfants', true);
  const list = sortedChildren();
  let h = `<h1>Enfants accueillis</h1>`;
  if (!list.length) h += `<p class="muted">Aucune fiche pour l'instant.</p>`;
  let pastShown = false;
  for (const c of list) {
    if (!isActive(c) && !pastShown) { h += `<h2 class="section-title">Accueils terminés ou à venir</h2>`; pastShown = true; }
    const v = currentVersion(c);
    h += `<a class="child-link" href="#/enfant/${c.id}">${avatar(c)}<span class="grow">
      <span class="child-name">${esc(c.prenom)}</span><br>
      <small>${fmtH(versionWeeklyHours(v))} / semaine${v.horairesB ? ' (moyenne A/B)' : ''}${v.semainesContrat ? ` · ${v.semainesContrat} sem./an` : ''}</small><br>
      <small>Depuis le ${fmtShortYear(c.debut)}${c.fin ? ` · jusqu'au ${fmtShortYear(c.fin)}` : ''}</small></span><span class="chev">›</span></a>`;
  }
  h += `<a class="btn primary block" href="#/nouvel-enfant" style="margin-top:6px">＋ Ajouter un enfant</a>`;
  app.innerHTML = h;
}

/* ---------- Fiche enfant (vue simplifiée + détails repliables) ---------- */
function renderChild(id) {
  const c = childById(id);
  if (!c) { location.hash = '#/enfants'; return; }
  setTitle(c.prenom, true);
  const p = ui.childPeriod, a = ui.childAnchor;
  const [ay, am] = a.split('-').map(Number);
  let t, label;
  if (p === 'week') { t = periodTotals.week(c, a); label = `Semaine du ${fmtDate(mondayOf(a), { day: 'numeric', month: 'long' })}`; }
  else if (p === 'month') { t = periodTotals.month(c, ay, am); label = `${MOIS[am]} ${ay}`; }
  else { t = periodTotals.year(c, ay); label = `Année ${ay}`; }
  const v = currentVersion(c);

  let h = `<div class="row" style="margin-bottom:12px">${avatar(c)}<div class="grow"><h1 style="margin:0">${esc(c.prenom)}</h1>
    <small>${isActive(c) ? 'Accueil en cours' : (c.debut > todayDS() ? 'Accueil à venir' : 'Accueil terminé')} · ${fmtH(versionWeeklyHours(v))}/sem.</small></div>
    <a class="btn small" href="#/enfant/${c.id}/modifier">Modifier</a></div>`;

  h += `<div class="seg" role="group" aria-label="Période">
      ${['week:Semaine', 'month:Mois', 'year:Année'].map((x) => { const [k, l] = x.split(':'); return `<button data-act="child-period" data-p="${k}" aria-pressed="${p === k}">${l}</button>`; }).join('')}
    </div>
    <div class="calnav"><button class="iconbtn" data-act="child-nav" data-d="-1" aria-label="Période précédente">‹</button>
      <div class="title">${label}</div>
      <button class="iconbtn" data-act="child-nav" data-d="1" aria-label="Période suivante">›</button></div>`;

  // 4 chiffres essentiels
  const pay = p === 'month' && hasTarif(c) ? payMonth(c, ay, am) : null;
  h += `<div class="stats">
    <div class="stat"><div class="v">${t.joursComptes}</div><div class="l">journées comptées</div></div>
    <div class="stat"><div class="v">${fmtH(t.heuresRetenues)}</div><div class="l">heures comptées</div></div>
    <div class="stat"><div class="v">${t.joursAbsEnfant + t.joursAbsEnfantNonRemu} <small>/</small> <span class="negv">${t.joursAbsAM}</span></div><div class="l">absences enfant / nounou</div></div>
    ${pay && pay.ok ? `<div class="stat"><div class="v">${euro(pay.net ? pay.totalVerse : pay.brut.total)}</div><div class="l">paie estimée${pay.partiel ? ' (à ce jour)' : ''}</div></div>`
      : `<div class="stat"><div class="v">${fmtH(t.heuresPrevues)}</div><div class="l">heures prévues</div></div>`}
  </div>`;
  if (t.joursAConfirmer) h += `<p class="note">⚠️ ${plural(t.joursAConfirmer, 'jour passé', 'jours passés')} sans saisie (non comptés).</p>`;

  if (p === 'month') h += payCardHTML(c, ay, am);
  h += `<details class="card fold"><summary>📊 Détail du décompte</summary>${totalsTable(c, t, p === 'year' ? ay : null)}</details>`;
  if (p === 'year') h += payRecapHTML(c, ay);

  // Contrat (planning + historique)
  h += `<details class="card fold"><summary>🗓️ Planning et contrat</summary>${contractHTML(c)}</details>`;

  h += `<div class="btn-row">
    <a class="btn primary" href="#/mois/${c.id}/${p === 'month' ? `${ay}-${pad(am)}` : todayDS().slice(0, 7)}">📄 Fiche du mois pour les parents</a>
    <button class="btn" data-act="cal-child" data-id="${c.id}">Calendrier</button>
    <button class="btn" data-act="recap-child" data-id="${c.id}">Récapitulatif</button></div>`;
  app.innerHTML = h;
}

function gridHTML(grid) {
  let h = '<ul class="list">';
  for (let wd = 1; wd <= 7; wd++) {
    const hh = grid && grid[wd];
    const on = hh && hh.on && hoursBetween(hh.a, hh.d) > 0;
    if (wd >= 6 && !on) continue;
    h += `<li class="row between"><strong>${JOURS[wd]}</strong>${on ? `<span>${hh.a} → ${hh.d} <small>(${fmtH(hoursBetween(hh.a, hh.d))})</small></span>` : badge('non_prevu', 'Pas d’accueil')}</li>`;
  }
  return h + '</ul>';
}
function versionSummary(v) {
  const t = tarifOf(v);
  return `${fmtH(versionWeeklyHours(v))}/sem.${v.horairesB ? ' (moyenne A/B)' : ''}${v.semainesContrat ? ` · ${v.semainesContrat} sem./an` : ''}${t.tauxNet != null ? ` · ${euro(t.tauxNet)} net/h` : t.tauxBrut != null ? ` · ${euro(t.tauxBrut)} brut/h` : ''}`;
}
function contractHTML(c) {
  const v = currentVersion(c);
  let h = '';
  if (v.horairesB) {
    const weekB = isWeekB(v, todayDS());
    h += `<p class="note">Horaires en alternance : cette semaine est une <strong>semaine ${weekB ? 'B' : 'A'}</strong>.</p>
      <h3>Semaine A</h3>${gridHTML(v.horaires)}<h3>Semaine B</h3>${gridHTML(v.horairesB)}`;
  } else h += gridHTML(v.horaires);
  h += `<p><strong>${versionSummary(v)}</strong></p>`;
  const t = tarifOf(v);
  if (hasTarifV(v)) h += `<p class="muted">💶 ${t.typeAnnee === 'complete' ? 'Année complète' : 'Année incomplète'} · entretien ${t.entretienMode === 'fixe' ? euro(t.entretienFixe) + '/jour' : t.entretienMode === 'prorata' ? 'proratisé' : 'minimum de la convention'}${t.repas || t.gouter ? ` · repas ${euro(t.repas + t.gouter)}/jour` : ''}${t.kmRate ? ` · ${euro(t.kmRate)}/km` : ''}</p>`;
  h += `<p class="muted">Contrat du ${fmtShortYear(c.debut)}${c.fin ? ` au ${fmtShortYear(c.fin)}` : ' (sans date de fin)'}</p>`;
  if (c.notes) h += `<p class="muted">📝 ${esc(c.notes)}</p>`;
  if (c.versions.length > 1) {
    h += `<h3>Historique du contrat</h3><ul class="list">` + c.versions.map((x, i) => `<li class="row wrap"><span class="grow"><strong>Depuis le ${fmtShortYear(x.from)}</strong><br><small>${versionSummary(x)}</small></span>
      ${i > 0 && i === c.versions.length - 1 ? `<button class="btn small danger" data-act="del-version" data-id="${c.id}">Supprimer</button>` : ''}</li>`).join('') + `</ul>`;
  }
  return h;
}

function totalsTable(c, t, year) {
  const row = (label, expl, val, cls = '') => `<tr class="${cls}"><th>${label}<span class="expl">${expl}</span></th><td>${val}</td></tr>`;
  const sep = (l) => `<tr class="sep"><th colspan="2">${l}</th></tr>`;
  let h = `<table class="kv">`;
  h += sep('Journées');
  h += row('Journées prévues', 'Jours d’accueil prévus au contrat sur la période.', t.joursPrevus);
  h += row('Journées comptées', 'Présences + absences de l’enfant (payées)' + (state.settings.congesMode === 'compte' ? ' + congés' : '') + '.', t.joursComptes);
  h += row('· dont présences', t.joursSupp ? `dont ${jours(t.joursSupp)} en plus du planning.` : 'Jours où l’enfant est venu.', t.joursPresence);
  h += row('· dont absences de l’enfant', 'Payées et comptées comme travaillées.', t.joursAbsEnfant);
  if (t.joursAbsEnfantNonRemu) h += row('Absences de l’enfant non payées', 'Maladie justifiée, les parents appliquent la retenue.', t.joursAbsEnfantNonRemu, 'neg');
  h += row('Journées déduites (nounou absente)', 'Retirées du décompte.', t.joursAbsAM ? '−' + t.joursAbsAM : 0, t.joursAbsAM ? 'neg' : '');
  h += row('Journées de congés', congesExpl(), t.joursConges);
  if (t.joursFeries) h += row('Jours fériés chômés', 'Ni comptés ni déduits.', t.joursFeries);
  if (t.joursAConfirmer) h += row('Jours passés sans saisie', 'Non comptés : confirmez-les depuis l’accueil.', t.joursAConfirmer);
  if (t.joursAVenir) h += row('Journées à venir', 'Pas encore passées.', t.joursAVenir);
  h += sep('Heures');
  h += row('Heures prévues', 'Horaires du contrat sur la période, absences comprises.', fmtH(t.heuresPrevues));
  h += row('Heures de présence', 'Temps où l’enfant était là (heures réelles, sinon planning).', fmtH(t.heuresRealisees));
  h += row('Heures comptées', 'Heures prévues des journées comptées + heures en plus du planning.', fmtH(t.heuresRetenues));
  if (t.heuresMaintenues) h += row('· dont absences de l’enfant', 'Heures prévues gardées malgré l’absence.', fmtH(t.heuresMaintenues));
  if (t.heuresSupp) h += row('· dont heures en plus', 'Présences plus longues que prévu ou jours en plus.', fmtH(t.heuresSupp));
  h += row('Heures déduites', 'Heures prévues des jours où la nounou était absente.', t.heuresDeduites ? fmtH(-t.heuresDeduites) : '0 h', t.heuresDeduites ? 'neg' : '');
  if (t.km) h += row('Kilomètres', 'Trajets avec l’enfant saisis sur les présences.', `${hDecimal(t.km)} km`);
  h += sep('Semaines');
  if (year) h += row('Semaines prévues au contrat', 'Indiqué dans le contrat.', versionAt(c, minDS(`${year}-12-31`, refDate(c))).semainesContrat || '—');
  h += row('Semaines écoulées', 'Semaines déjà commencées pendant l’accueil.', t.semainesEcoulees);
  h += row('Semaines d’accueil comptées', 'Au moins une journée comptée.', t.semainesComptees);
  h += row('Semaines où l’enfant est venu', 'Au moins une présence.', t.semainesEffectives);
  if (year) h += row('Semaines depuis le début du contrat', 'Toutes années confondues.', weeksSinceStart(c));
  return h + `</table>`;
}
function congesExpl() {
  return { non_compte: 'Ni comptées ni déduites (réglage actuel).', compte: 'Comptées comme travaillées (réglage actuel).', deduit: 'Déduites comme une absence de la nounou (réglage actuel).' }[state.settings.congesMode];
}

/* ---------- Formulaire enfant : étapes (création) ou sections repliables (modification) ---------- */
const DEF_SLOT = { a: '08:00', d: '17:00' };
function gridInputs(prefix, grid, label) {
  let h = `<div class="daygrid" data-grid="${prefix}">${label ? `<h3>${label}</h3>` : ''}`;
  for (let wd = 1; wd <= 7; wd++) {
    const hh = (grid && grid[wd]) || { on: false, ...DEF_SLOT };
    h += `<div class="dayline${hh.on ? '' : ' off'}" data-wd="${wd}" data-p="${prefix}">
      <label class="dl"><input type="checkbox" name="${prefix}on${wd}" ${hh.on ? 'checked' : ''}> ${JOURS_COURTS[wd]}</label>
      <input type="time" name="${prefix}a${wd}" value="${esc(hh.a || DEF_SLOT.a)}" aria-label="${JOURS[wd]} arrivée ${label || ''}">
      <input type="time" name="${prefix}d${wd}" value="${esc(hh.d || DEF_SLOT.d)}" aria-label="${JOURS[wd]} départ ${label || ''}">
      <span class="dh" id="${prefix}dh${wd}"></span></div>`;
  }
  return h + `</div>`;
}
function readGrid(form, prefix) {
  const g = {};
  for (let wd = 1; wd <= 7; wd++) g[wd] = { on: form[prefix + 'on' + wd].checked, a: form[prefix + 'a' + wd].value, d: form[prefix + 'd' + wd].value };
  return g;
}

function renderChildForm(id) {
  const c = id ? childById(id) : null;
  if (id && !c) { location.hash = '#/enfants'; return; }
  const creating = !c;
  if (creating) ui.formStep = 1;
  setTitle(c ? `Modifier ${c.prenom}` : 'Nouvel enfant', true);
  const v = c ? lastVersion(c) : { from: todayDS(), horaires: {}, horairesB: null, refA: null, semainesContrat: '', tarif: {} };
  const step = ui.formStep;
  const sec = (n, title, body, open) => creating
    ? `<section class="card step" data-step="${n}" ${n === step ? '' : 'hidden'}><h2>${title}</h2>${body}</section>`
    : `<details class="card fold" ${open ? 'open' : ''}><summary>${title}</summary>${body}</details>`;

  const identite = `
    <label class="field">Prénom ou nom d'usage *<input name="prenom" required maxlength="40" value="${esc(c ? c.prenom : '')}" placeholder="Ex. : Léa"></label>
    <div class="two">
      <label class="field">Début d'accueil *<input type="date" name="debut" required value="${esc(c ? c.debut : todayDS())}"></label>
      <label class="field">Fin d'accueil<input type="date" name="fin" value="${esc(c ? c.fin || '' : '')}"><span class="hint">Si connue</span></label>
    </div>
    <label class="field">Notes (facultatif)<textarea name="notes" maxlength="500" placeholder="Ex. : récupéré par le papa le mercredi">${esc(c ? c.notes || '' : '')}</textarea>
      <span class="hint">Évitez les informations médicales : elles ne sont pas utiles au suivi.</span></label>`;

  const versionChoice = c ? `<div class="card tinted" style="margin:0 0 14px">
      <p style="margin-top:0"><strong>Ces horaires et tarifs…</strong></p>
      <label class="check"><input type="radio" name="vmode" value="fix" checked><span>Corriger la fiche actuelle<br><small class="muted">Erreur de saisie : s'applique depuis le ${fmtShortYear(lastVersion(c).from)}.</small></span></label>
      <label class="check"><input type="radio" name="vmode" value="new"><span>Changent à partir d'une date (avenant)<br><small class="muted">Les mois passés gardent les anciennes valeurs.</small></span></label>
      <label class="field" id="vfromWrap" hidden>À partir du<input type="date" name="vfrom" value="${todayDS()}"></label></div>` : '';

  const horaires = `${versionChoice}
    <p class="muted">Cochez les jours d'accueil et indiquez l'arrivée et le départ.</p>
    ${gridInputs('A', v.horaires, v.horairesB ? 'Semaine A' : '')}
    <label class="check" style="margin-top:8px"><input type="checkbox" name="alt" ${v.horairesB ? 'checked' : ''}><span>Les horaires changent une semaine sur deux (semaine A / semaine B)</span></label>
    <div id="altWrap" ${v.horairesB ? '' : 'hidden'}>
      ${gridInputs('B', v.horairesB || v.horaires, 'Semaine B')}
      <label class="field">Une semaine A commence le (lundi)<input type="date" name="refA" value="${esc(v.refA || mondayOf(v.from))}"></label>
    </div>
    <p style="margin-top:12px"><strong>Total hebdomadaire : <span id="weekTotal"></span></strong></p>
    <label class="field">Semaines prévues au contrat (par an)<input type="number" inputmode="numeric" name="semainesContrat" min="1" max="52" value="${esc(v.semainesContrat || '')}" placeholder="Ex. : 46"><span class="hint">Tel qu'indiqué dans le contrat.</span></label>`;

  const tarifs = tarifFormHTML(v.tarif || {});

  let h = `<h1>${c ? 'Modifier la fiche' : 'Nouvel enfant'}</h1>`;
  if (creating) h += `<ol class="steps">${['Identité', 'Horaires', 'Tarifs'].map((l, i) => `<li class="${i + 1 === step ? 'cur' : i + 1 < step ? 'done' : ''}">${i + 1}. ${l}</li>`).join('')}</ol>`;
  h += `<form id="childForm" autocomplete="off" novalidate>
    ${sec(1, '👶 Identité', identite, true)}
    ${sec(2, '🗓️ Horaires', horaires, true)}
    ${sec(3, '💶 Tarifs du contrat (facultatif)', tarifs, hasTarifV(v))}
    <p class="note" id="formError" role="alert" style="color:var(--absam-bd);font-weight:700"></p>
    <div class="btn-row" id="formNav">${creating ? stepNavHTML(step) : `<button type="submit" class="btn primary">Enregistrer</button><a class="btn" href="#/enfant/${c.id}">Annuler</a>`}`;
  h += `</div>${c ? `<button type="button" class="btn danger block" style="margin-top:22px" data-act="delete-child" data-id="${c.id}">Supprimer cette fiche et ses saisies</button>` : ''}</form>`;
  app.innerHTML = h;

  const form = document.getElementById('childForm');
  const upd = () => {
    const alt = form.alt.checked;
    document.getElementById('altWrap').hidden = !alt;
    if (c) document.getElementById('vfromWrap').hidden = form.querySelector('input[name="vmode"]:checked').value !== 'new';
    let totA = 0, totB = 0;
    for (const p of ['A', 'B']) {
      for (let wd = 1; wd <= 7; wd++) {
        const on = form[p + 'on' + wd].checked;
        const hrs = on ? hoursBetween(form[p + 'a' + wd].value, form[p + 'd' + wd].value) : 0;
        form.querySelector(`.dayline[data-p="${p}"][data-wd="${wd}"]`).classList.toggle('off', !on);
        document.getElementById(p + 'dh' + wd).textContent = on ? (hrs ? fmtH(hrs) : '⚠️ horaires à vérifier') : '';
        if (p === 'A') totA += hrs; else totB += hrs;
      }
    }
    const avg = alt ? (totA + totB) / 2 : totA;
    document.getElementById('weekTotal').textContent = alt ? `${fmtH(avg)} en moyenne (A : ${fmtH(totA)}, B : ${fmtH(totB)})` : fmtH(totA);
    mensuPreview(form, avg);
  };
  form.addEventListener('input', upd);
  form.addEventListener('change', upd);
  upd();
  form.addEventListener('submit', (ev) => { ev.preventDefault(); submitChildForm(form, c); });
}

function validateChildForm(form, c, upToStep = 3) {
  const prenom = form.prenom.value.trim();
  const debut = form.debut.value, fin = form.fin.value;
  if (!prenom) return { error: 'Indiquez un prénom.', step: 1 };
  if (!debut) return { error: 'Indiquez la date de début d’accueil.', step: 1 };
  if (fin && fin < debut) return { error: 'La date de fin est avant la date de début.', step: 1 };
  if (c && c.versions.length > 1 && debut >= c.versions[1].from) return { error: `La date de début doit être avant le changement de contrat du ${fmtShortYear(c.versions[1].from)}.`, step: 1 };
  if (upToStep < 2) return {};
  const alt = form.alt.checked;
  const grids = { A: readGrid(form, 'A'), B: alt ? readGrid(form, 'B') : null };
  for (const p of alt ? ['A', 'B'] : ['A']) for (let wd = 1; wd <= 7; wd++) {
    const g = grids[p][wd];
    if (g.on && !hoursBetween(g.a, g.d)) return { error: `Horaires du ${JOURS[wd].toLowerCase()}${alt ? ` (semaine ${p})` : ''} incorrects : le départ doit être après l'arrivée.`, step: 2 };
  }
  if (!gridHours(grids.A) && !(grids.B && gridHours(grids.B))) return { error: 'Cochez au moins un jour d’accueil.', step: 2 };
  const sem = form.semainesContrat.value ? Math.min(52, Math.max(1, parseInt(form.semainesContrat.value, 10))) : '';
  let vmode = 'fix', vfrom = null;
  if (c) {
    vmode = form.querySelector('input[name="vmode"]:checked').value;
    vfrom = form.vfrom.value;
    if (vmode === 'new' && (!vfrom || vfrom <= lastVersion(c).from)) return { error: `La date du changement doit être après le ${fmtShortYear(lastVersion(c).from)}.`, step: 2 };
  }
  if (upToStep < 3) return {};
  const tf = readTarifForm(form);
  if (tf.error) return { error: tf.error, step: 3 };
  if (tf.tarif.typeAnnee === 'incomplete' && !sem) return { error: 'Année incomplète : indiquez le nombre de semaines prévues au contrat.', step: 2 };
  return { prenom, debut, fin, grids, sem, tarif: tf.tarif, alt, refA: alt ? (form.refA.value || debut) : null, vmode, vfrom };
}

function submitChildForm(form, c) {
  const err = document.getElementById('formError');
  const r = validateChildForm(form, c);
  if (r.error) { err.textContent = r.error; if (!c && r.step) { ui.formStep = r.step; showStep(r.step); } return; }
  const version = { horaires: r.grids.A, horairesB: r.grids.B, refA: r.refA, semainesContrat: r.sem, tarif: r.tarif };
  if (c) {
    Object.assign(c, { prenom: r.prenom, debut: r.debut, fin: r.fin || '', notes: form.notes.value.trim() });
    if (r.vmode === 'new') c.versions.push({ from: r.vfrom, ...version });
    else Object.assign(lastVersion(c), version);
    c.versions[0].from = minDS(c.versions[0].from, r.debut);
    if (c.versions.length === 1) c.versions[0].from = r.debut;
  } else {
    state.children.push({ id: uid(), prenom: r.prenom, debut: r.debut, fin: r.fin || '', notes: form.notes.value.trim(),
      versions: [{ from: r.debut, ...version }], declared: {}, createdAt: new Date().toISOString() });
  }
  save();
  toast(c && r.vmode === 'new' ? `Nouveau contrat enregistré à partir du ${fmtShortYear(r.vfrom)}` : 'Fiche enregistrée');
  location.hash = '#/enfant/' + (c ? c.id : state.children[state.children.length - 1].id);
}
function stepNavHTML(step) {
  return (step > 1 ? `<button type="button" class="btn" data-act="form-step" data-d="-1">‹ Précédent</button>` : `<a class="btn" href="#/enfants">Annuler</a>`)
    + (step < 3 ? `<button type="button" class="btn primary" data-act="form-step" data-d="1">Suivant ›</button>` : `<button type="submit" class="btn primary">Enregistrer</button>`);
}
function showStep(n) {
  document.querySelectorAll('#childForm .step').forEach((sct) => { sct.hidden = +sct.dataset.step !== n; });
  document.querySelectorAll('.steps li').forEach((li, i) => { li.className = i + 1 === n ? 'cur' : i + 1 < n ? 'done' : ''; });
  document.getElementById('formNav').innerHTML = stepNavHTML(n);
  document.getElementById('formError').textContent = '';
  window.scrollTo(0, 0);
}

/* ---------- Calendrier ---------- */
function renderCalendar() {
  setTitle('Calendrier', true);
  const kids = sortedChildren();
  if (!kids.length) { app.innerHTML = `<div class="card empty"><p>Ajoutez d'abord un enfant.</p><a class="btn primary" href="#/nouvel-enfant">Ajouter un enfant</a></div>`; return; }
  if (ui.calChild !== 'all' && !childById(ui.calChild)) ui.calChild = 'all';
  const v = ui.calView, d = ui.calDate;
  let title;
  if (v === 'jour') title = fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' });
  else if (v === 'semaine') { const mo = mondayOf(d); title = `${fmtDate(mo, { day: 'numeric', month: 'short' })} – ${fmtDate(addDays(mo, 6), { day: 'numeric', month: 'short' })}`; }
  else title = `${MOIS[+d.slice(5, 7)]} ${d.slice(0, 4)}`;

  let h = `<div class="seg" role="group" aria-label="Affichage">
      ${['jour:Jour', 'semaine:Semaine', 'mois:Mois'].map((x) => { const [k, l] = x.split(':'); return `<button data-act="cal-view" data-v="${k}" aria-pressed="${v === k}">${l}</button>`; }).join('')}
    </div>
    <div class="chips" role="group" aria-label="Enfant" style="margin-top:10px">
      <button class="chip" data-act="cal-filter" data-id="all" aria-pressed="${ui.calChild === 'all'}">Tous</button>
      ${kids.map((c) => `<button class="chip" data-act="cal-filter" data-id="${c.id}" aria-pressed="${ui.calChild === c.id}">${esc(c.prenom)}</button>`).join('')}
    </div>
    <div class="calnav"><button class="iconbtn" data-act="cal-nav" data-d="-1" aria-label="Précédent">‹</button>
      <div class="title">${title}</div>
      <button class="iconbtn" data-act="cal-nav" data-d="1" aria-label="Suivant">›</button></div>
    <div class="row" style="justify-content:center;margin-bottom:8px"><button class="btn small" data-act="cal-today">Aujourd'hui</button></div>`;
  const shown = ui.calChild === 'all' ? kids : [childById(ui.calChild)];
  if (v === 'mois') h += monthView(d, shown);
  else if (v === 'semaine') h += weekView(d, shown);
  else h += dayView(d, shown);
  h += `<details class="help"><summary>Légende</summary><div class="legend">${['presence', 'presence_auto', 'absence_enfant', 'absence_am', 'conges', 'ferie', 'prevu', 'non_prevu'].map((s) => badge(s)).join('')}</div>
    <p class="note">« Présent (prévu) » : jour passé sans saisie, compté comme présence selon le planning${state.settings.presenceAuto ? '' : ' (désactivé)'}.</p></details>`;
  app.innerHTML = h;
}

function monthView(d, kids) {
  const y = +d.slice(0, 4), m = +d.slice(5, 7), first = monthFirst(y, m), last = monthLast(y, m), today = todayDS();
  const single = kids.length === 1 ? kids[0] : null;
  let h = `<div class="month${single ? '' : ' multi'}">` + [1, 2, 3, 4, 5, 6, 7].map((w) => `<div class="wd">${JOURS_COURTS[w]}</div>`).join('');
  for (let i = 1; i < isoWd(first); i++) h += `<div class="mcell out"></div>`;
  for (const ds of eachDay(first, last)) {
    const f = ferieName(ds);
    let inner = '', cls = '', aria = fmtLong(ds);
    if (single) {
      const r = dayInfo(single, ds, today);
      cls = ` t-${r.status}`;
      inner = `<span class="mk" aria-hidden="true">${STATUS_IC[r.status] || ''}</span>`;
      aria += ', ' + statusLabel(r);
    } else {
      inner = `<span class="dots">` + kids.map((c) => {
        const r = dayInfo(c, ds, today);
        if (r.status === 'non_prevu' || r.status === 'hors') return '';
        aria += `, ${c.prenom} : ${statusLabel(r)}`;
        return `<span class="dot t-${r.status}">${esc(c.prenom.charAt(0).toUpperCase())}</span>`;
      }).join('') + `</span>`;
    }
    if (f) aria += ', férié : ' + f;
    h += `<button class="mcell${cls}${ds === today ? ' today' : ''}" data-act="goto-day" data-date="${ds}" aria-label="${esc(aria)}">
      <span class="n">${+ds.slice(8)}${f ? '<span class="fstar" aria-hidden="true">★</span>' : ''}</span>${inner}</button>`;
  }
  h += `</div>`;
  if (single) {
    const t = periodTotals.month(single, y, m);
    h += `<div class="stats" style="margin-top:12px">
      <div class="stat"><div class="v">${t.joursComptes}</div><div class="l">journées comptées</div></div>
      <div class="stat"><div class="v">${t.joursAbsEnfant} <small>/</small> <span class="negv">${t.joursAbsAM}</span></div><div class="l">absences enfant / nounou</div></div></div>`;
  } else h += `<p class="note">Touchez un prénom en haut pour voir le calendrier d'un seul enfant, en plus grand.</p>`;
  return h;
}

function weekView(d, kids) {
  const mo = mondayOf(d), today = todayDS();
  let h = '';
  for (let i = 0; i < 7; i++) {
    const ds = addDays(mo, i), f = ferieName(ds);
    const lines = kids.map((c) => {
      const r = dayInfo(c, ds, today);
      if ((r.status === 'non_prevu' || r.status === 'hors') && kids.length > 1) return '';
      const s = slotAt(c, ds);
      const info = r.entry?.type === 'presence' && r.entry.a ? `${r.entry.a} → ${r.entry.d}` : (s ? `${s.a} → ${s.d}` : '');
      return `<div class="wline"><span class="nm">${esc(c.prenom)}</span>${badge(r.status, statusLabel(r))}<small>${info}</small></div>`;
    }).join('');
    if (!lines && i >= 5) continue;
    h += `<button class="weekday${ds === today ? ' today' : ''}" data-act="goto-day" data-date="${ds}">
      <div class="wdh"><span>${fmtDate(ds, { weekday: 'long', day: 'numeric', month: 'short' })}</span>${f ? badge('ferie', f) : '<span class="chev">›</span>'}</div>
      ${lines || '<small class="muted">Aucun accueil prévu</small>'}</button>`;
  }
  return h;
}

function dayView(ds, kids) {
  const today = todayDS(), f = ferieName(ds);
  let h = f ? `<div class="card warn"><strong>★ Jour férié : ${f}</strong><p class="note">${state.settings.feriesMode === 'travaille' ? 'Compté comme travaillé selon vos réglages.' : 'Compté comme chômé. S’il a été travaillé, touchez « Présent ».'}</p></div>` : '';
  for (const c of kids) {
    const r = dayInfo(c, ds, today);
    const s = slotAt(c, ds);
    h += `<div class="daycard"><div class="row between wrap">${avatar(c, true)}<strong class="grow">${esc(c.prenom)}</strong>${badge(r.status, statusLabel(r))}</div>`;
    if (r.status === 'hors') { h += `<p class="muted">En dehors des dates du contrat.</p></div>`; continue; }
    h += `<p class="muted">Prévu : ${s ? `${s.a} → ${s.d} (${fmtH(r.planned)})` : 'pas d’accueil ce jour'}${r.entry?.type === 'presence' && r.entry.a ? ` · Réel : ${r.entry.a} → ${r.entry.d} (${fmtH(r.real)})` : ''}${r.km ? ` · ${hDecimal(r.km)} km` : ''}${r.entry?.motif ? ` · ${esc(r.entry.motif)}` : ''}</p>`;
    h += `<p class="note"><strong>Effet :</strong> ${dayEffectText(r)}</p>`;
    h += `<div class="quick">
      ${['presence', 'absence_enfant', 'absence_am', 'conges'].map((t) => `<button class="t-${t}${r.entry && r.entry.type === t ? ' on' : ''}" data-act="quick" data-type="${t}" data-id="${c.id}" data-date="${ds}">${TYPES[t].ic} ${TYPES[t].label}</button>`).join('')}
      <button class="t-prevu" data-act="open-entry" data-type="${r.entry ? r.entry.type : 'presence'}" data-id="${c.id}" data-date="${ds}">⏱ Heures, km, options…</button>
      <button class="t-non_prevu" data-act="clear-day" data-id="${c.id}" data-date="${ds}" ${r.entry ? '' : 'disabled'}>↺ Effacer</button>
    </div></div>`;
  }
  return h;
}

function dayEffectText(r) {
  switch (r.status) {
    case 'presence': case 'presence_auto':
      return `journée comptée · ${fmtH(r.real)} de présence${r.extra ? ` (dont ${fmtH(r.extra)} en plus du planning)` : ''}.`;
    case 'absence_enfant':
      if (r.nonRemu) return r.planned ? 'maladie justifiée, non payée : journée ni comptée ni payée.' : 'jour sans accueil prévu : aucun effet.';
      return r.planned ? `journée payée et comptée · ${fmtH(r.planned)} gardées.` : 'jour sans accueil prévu : aucun effet.';
    case 'absence_am':
      return r.planned ? `journée retirée · ${fmtH(-r.planned)}${r.remuneree ? ' · absence payée : pas de déduction sur le salaire' : ' · déduite du salaire'}.` : 'jour sans accueil prévu : aucun effet.';
    case 'conges':
      return !r.planned ? 'jour sans accueil prévu : aucun effet.' : r.counted ? 'journée comptée (réglage des congés).' : r.deductedDay ? 'journée retirée du décompte (réglage des congés), sans déduction de salaire.' : 'ni comptée ni déduite.';
    case 'prevu': return 'journée prévue, sans saisie.';
    case 'ferie': return 'jour férié chômé : ni compté ni déduit, pas d’indemnité d’entretien.';
    case 'non_prevu': return 'pas d’accueil prévu ce jour.';
    default: return '';
  }
}

/* ---------- Récapitulatif ---------- */
function renderRecap() {
  setTitle('Récapitulatif', true);
  const kids = sortedChildren();
  if (!kids.length) { app.innerHTML = `<div class="card empty"><p>Ajoutez d'abord un enfant.</p><a class="btn primary" href="#/nouvel-enfant">Ajouter un enfant</a></div>`; return; }
  const y = ui.recapYear, mSel = ui.recapMonth;
  const years = new Set([+todayDS().slice(0, 4)]);
  for (const c of state.children) {
    const end = +(c.fin || todayDS()).slice(0, 4);
    for (let yy = +c.debut.slice(0, 4); yy <= Math.max(end, +todayDS().slice(0, 4)); yy++) years.add(yy);
  }
  const list = (ui.recapChild === 'all' ? kids : [childById(ui.recapChild)].filter(Boolean)).filter((c) => totalsTouches(c, y));

  let h = `<div class="no-print"><h1>Récapitulatif</h1>
    <div class="card">
      <div class="two">
        <label class="field">Année<select data-act="recap-year">${[...years].sort((a, b) => b - a).map((yy) => `<option ${yy === y ? 'selected' : ''}>${yy}</option>`).join('')}</select></label>
        <label class="field">Mois<select data-act="recap-month"><option value="0">Toute l'année</option>${MOIS.slice(1).map((mm, i) => `<option value="${i + 1}" ${mSel === i + 1 ? 'selected' : ''}>${mm}</option>`).join('')}</select></label>
      </div>
      <label class="field" style="margin-bottom:0">Enfant<select data-act="recap-child"><option value="all">Tous les enfants</option>${kids.map((c) => `<option value="${c.id}" ${ui.recapChild === c.id ? 'selected' : ''}>${esc(c.prenom)}</option>`).join('')}</select></label>
    </div>
    <div class="btn-row">
      <button class="btn primary" data-act="print">🖨️ Imprimer / PDF</button>
      <button class="btn" data-act="export-csv">📄 Export tableur</button>
    </div>
    <p class="note">Pour un PDF : « Imprimer / PDF », puis « Enregistrer au format PDF ».</p></div>
  <div class="print-only"><img src="logo.svg" alt="NounouRepère" class="print-logo"><p>Récapitulatif ${mSel ? MOIS[mSel] + ' ' : ''}${y} — édité le ${fmtShortYear(todayDS())}</p></div>`;

  if (!list.length) h += `<div class="card"><p>Aucun accueil en ${y} pour cette sélection.</p></div>`;
  for (const c of list) {
    const tY = mSel ? periodTotals.month(c, y, mSel) : periodTotals.year(c, y);
    h += `<section class="child-recap"><h2 class="section-title" style="display:flex;align-items:center;gap:10px">${avatar(c, true)} ${esc(c.prenom)} — ${mSel ? MOIS[mSel] + ' ' : ''}${y}</h2>`;
    h += `<div class="card">${totalsTable(c, tY, mSel ? null : y)}</div>`;
    if (mSel) h += `<p class="no-print"><a href="#/mois/${c.id}/${y}-${pad(mSel)}">📄 Fiche du mois pour les parents</a></p>`;
    if (!mSel) {
      h += `<h3>Détail par mois</h3><div class="tablewrap"><table class="recap"><thead><tr>
        <th>Mois</th><th>Jours prévus</th><th>Jours comptés</th><th>dont présences</th><th>dont abs. enfant</th><th>Jours déduits (nounou)</th><th>Congés</th>
        <th>Heures prévues</th><th>Heures de présence</th><th>Heures comptées</th><th>Heures déduites</th><th>Sem. comptées</th></tr></thead><tbody>`;
      for (let m = 1; m <= 12; m++) {
        const t = periodTotals.month(c, y, m);
        if (!t.joursPrevus && !t.joursComptes && !t.joursConges) continue;
        h += `<tr><td><a href="#/mois/${c.id}/${y}-${pad(m)}">${MOIS[m]}</a></td><td>${t.joursPrevus}</td><td>${t.joursComptes}</td><td>${t.joursPresence}</td><td>${t.joursAbsEnfant}</td>
          <td class="${t.joursAbsAM ? 'col-neg' : ''}">${t.joursAbsAM}</td><td>${t.joursConges}</td><td>${fmtH(t.heuresPrevues)}</td><td>${fmtH(t.heuresRealisees)}</td>
          <td>${fmtH(t.heuresRetenues)}</td><td class="${t.heuresDeduites ? 'col-neg' : ''}">${fmtH(t.heuresDeduites)}</td><td>${t.semainesComptees}</td></tr>`;
      }
      h += `</tbody><tfoot><tr><td>Total ${y}</td><td>${tY.joursPrevus}</td><td>${tY.joursComptes}</td><td>${tY.joursPresence}</td><td>${tY.joursAbsEnfant}</td><td>${tY.joursAbsAM}</td><td>${tY.joursConges}</td>
        <td>${fmtH(tY.heuresPrevues)}</td><td>${fmtH(tY.heuresRealisees)}</td><td>${fmtH(tY.heuresRetenues)}</td><td>${fmtH(tY.heuresDeduites)}</td><td>${tY.semainesComptees}</td></tr></tfoot></table></div>
        <p class="note">Une semaine à cheval sur deux mois apparaît dans les deux ; le total annuel la compte une fois. Touchez un mois pour sa fiche.</p>`;
      h += payRecapHTML(c, y);
      const abs = state.entries.filter((e) => e.childId === c.id && e.type !== 'presence' && e.date.startsWith(String(y)));
      if (abs.length) {
        h += `<h3>Absences et congés</h3><div class="card"><ul class="list">` + groupAbsences(abs).map((g) =>
          `<li class="row between wrap"><span>${g.from === g.to ? fmtShortYear(g.from) : `${fmtShortYear(g.from)} → ${fmtShortYear(g.to)}`}${g.motif ? ` <small>(${esc(g.motif)})</small>` : ''}</span>${badge(g.type, TYPES[g.type].label)}</li>`).join('') + `</ul></div>`;
      }
    }
    h += `</section>`;
  }
  if (!mSel && list.length) h += documentsBlock(list, y) + fiscalHelperHTML(list, y);
  if (list.length) h += `<p class="no-print" style="margin-top:12px"><a href="#/regles">📚 Règles utilisées et sources</a></p>`;
  app.innerHTML = h;
}
const totalsTouches = (c, y) => c.debut <= `${y}-12-31` && (!c.fin || c.fin >= `${y}-01-01`);

function documentsBlock(list, y) {
  let h = `<section class="card tinted child-recap" style="margin-top:20px"><h2>🧾 Données utiles pour vos documents ${y}</h2>
    <p>Données de suivi et montants <strong>estimés</strong>. Pour vos déclarations, les relevés Pajemploi font foi.</p>
    <div class="tablewrap" style="margin-top:10px"><table class="recap" style="min-width:860px"><thead><tr><th>Enfant</th><th>Accueil en ${y}</th><th>Journées comptées</th><th>Journées déduites</th><th>Heures comptées</th><th>Sem. comptées</th><th>Salaire net estimé</th><th>Entretien</th><th>Repas</th><th>Km</th></tr></thead><tbody>`;
  for (const c of list) {
    const t = periodTotals.year(c, y);
    const pa = hasTarif(c) ? payYear(c, y) : null;
    const s = maxDS(c.debut, `${y}-01-01`), e = c.fin ? minDS(c.fin, `${y}-12-31`) : `${y}-12-31`;
    h += `<tr><td>${esc(c.prenom)}</td><td>${fmtShortYear(s)} → ${fmtShortYear(e)}</td><td>${t.joursComptes}</td><td>${t.joursAbsAM}</td><td>${fmtH(t.heuresRetenues)}</td><td>${t.semainesComptees}</td><td>${pa && pa.hasNet ? euro(pa.net) : '—'}</td><td>${pa ? euro(pa.entretien) : '—'}</td><td>${pa ? euro(pa.repas) : '—'}</td><td>${pa ? euro(pa.km) : '—'}</td></tr>`;
  }
  h += `</tbody></table></div>
    <details class="help"><summary>Hypothèses utilisées</summary><ul>
      <li>Enfant absent un jour prévu : journée payée et comptée (sauf maladie justifiée avec retenue des parents, cochée sur la saisie).</li>
      <li>Nounou absente : journée retirée ; déduite du salaire sauf si « absence payée » est cochée.</li>
      <li>Congés : ${congesExpl().toLowerCase()}</li>
      <li>Jour prévu passé sans saisie : ${state.settings.presenceAuto ? 'présence selon le planning (à confirmer depuis l’accueil)' : 'non compté'}.</li>
      <li>Présence plus courte que prévu : heures prévues comptées ; plus longue : heures en plus ajoutées.</li>
      <li>Jour férié sans saisie : ${state.settings.feriesMode === 'travaille' ? 'travaillé' : 'chômé'} ; majoration d'un férié travaillé non calculée.</li>
      <li>Changement de contrat : chaque période garde ses horaires et tarifs.</li>
    </ul></details></section>`;
  return h;
}

/* ---------- Réglages ---------- */
function renderSettings() {
  setTitle('Réglages', true);
  const s = state.settings;
  app.innerHTML = `<h1>Réglages</h1>
  <div class="card"><h2>🔠 Affichage</h2>
    <p class="muted" style="margin-top:0">Taille du texte</p>
    <div class="seg" role="group" aria-label="Taille du texte">
      ${[['normal', 'Normal'], ['grand', 'Grand'], ['tres_grand', 'Très grand']].map(([k, l]) => `<button data-act="text-size" data-v="${k}" aria-pressed="${s.textSize === k}">${l}</button>`).join('')}
    </div>
    <button class="btn small" style="margin-top:12px" data-act="show-welcome">Revoir la présentation</button>
  </div>
  <a class="child-link" href="#/regles"><span class="avatar" style="background:var(--sauge)" aria-hidden="true">📚</span><span class="grow"><span class="child-name">Règles & sources</span><br><small>Règles utilisées et sources officielles</small></span><span class="chev">›</span></a>
  <div class="card"><h2>Règles de décompte</h2>
    <div class="effect t-absence_enfant"><strong>🧒 Enfant absent</strong> (jour prévu) : la journée est <strong>payée et comptée</strong>.</div>
    <div class="effect t-absence_am"><strong>👩 Nounou absente</strong> : la journée est <strong>retirée</strong> et déduite du salaire (sauf absence payée).</div>
    <label class="field">Les jours de congés…
      <select data-act="set" data-key="congesMode">
        <option value="non_compte" ${s.congesMode === 'non_compte' ? 'selected' : ''}>ne sont ni comptés ni déduits</option>
        <option value="compte" ${s.congesMode === 'compte' ? 'selected' : ''}>comptent comme des journées travaillées</option>
        <option value="deduit" ${s.congesMode === 'deduit' ? 'selected' : ''}>sont retirés du décompte des journées</option>
      </select><span class="hint">Concerne le décompte des journées. Les congés ne sont jamais déduits du salaire.</span></label>
    <label class="check"><input type="checkbox" data-act="set" data-key="presenceAuto" ${s.presenceAuto ? 'checked' : ''}>
      <span>Compter les jours prévus passés sans saisie comme des présences<br><small class="muted">Ils restent « à vérifier » sur l'accueil pendant 14 jours.</small></span></label>
    <label class="check"><input type="checkbox" data-act="set" data-key="afficherFeries" ${s.afficherFeries ? 'checked' : ''}><span>Afficher les jours fériés</span></label>
    <label class="field">Un jour férié tombant un jour d'accueil, sans saisie, est…
      <select data-act="set" data-key="feriesMode">
        <option value="chome" ${s.feriesMode !== 'travaille' ? 'selected' : ''}>chômé (pas d'accueil)</option>
        <option value="travaille" ${s.feriesMode === 'travaille' ? 'selected' : ''}>travaillé comme prévu</option>
      </select></label>
  </div>
  ${refsSettingsHTML()}
  <div class="card"><h2>💾 Sauvegarde</h2>
    <p>${state.children.length} fiche(s), ${state.entries.length} saisie(s). ${s.lastBackup ? `Dernière sauvegarde : ${fmtShortYear(s.lastBackup.slice(0, 10))}.` : '<strong>Aucune sauvegarde pour l’instant.</strong>'}</p>
    <button class="btn primary block" data-act="backup">Créer un fichier de sauvegarde</button>
    <p class="note">Rangez le fichier en lieu sûr : il contient les prénoms et plannings.</p>
    <label class="btn block" style="margin-top:10px">Restaurer une sauvegarde<input type="file" accept="application/json,.json" data-act="restore" hidden></label>
  </div>
  <div class="card"><h2>🔒 Où sont mes données ?</h2>
    <p>Uniquement <strong>dans ce téléphone</strong>, dans le navigateur. Rien n'est envoyé sur Internet, aucun compte.</p>
    <p><strong>Attention :</strong> téléphone perdu, réinitialisé ou remplacé, ou données du navigateur effacées = tout est perdu. Sauvegardez chaque mois et avant de changer de téléphone.</p>
    <p class="note" id="persistInfo"></p>
  </div>
  <div class="card"><h2>🗑️ Supprimer les données</h2>
    <p>Supprime toutes les fiches et saisies de ce téléphone. Action définitive.</p>
    <button class="btn danger block" data-act="wipe">Tout supprimer</button>
  </div>
  <p class="note" style="text-align:center">NounouRepère · version 2.0 · fonctionne sans connexion</p>`;
  if (navigator.storage?.persisted) navigator.storage.persisted().then((p) => {
    const el = document.getElementById('persistInfo');
    if (el) el.textContent = p ? 'Stockage protégé : le téléphone ne doit pas effacer ces données automatiquement.' : 'Conseil : installez l’application sur l’écran d’accueil pour que le téléphone protège mieux ces données.';
  });
}

/* ======================= 5. Saisie, annulation, bilan du jour ======================= */

const sheet = document.getElementById('sheet');
const backdrop = document.getElementById('sheetBackdrop');
let entryDraft = null;

function openEntry(opts = {}) {
  if (!state.children.length) { location.hash = '#/nouvel-enfant'; toast('Ajoutez d’abord un enfant'); return; }
  const date = opts.date || todayDS();
  const kids = sortedChildren().filter((c) => isActive(c, date) || c.id === opts.childId);
  const all = kids.length ? kids : sortedChildren();
  const type = opts.type || null; // aucun type présélectionné : il faut choisir
  const pre = opts.childId || (ui.calChild !== 'all' && location.hash.startsWith('#/calendrier') ? ui.calChild : null);
  entryDraft = {
    type, mode: 'jour', from: date, to: date, a: '', d: '', km: '', motif: '', retenue: false, remuneree: false,
    kids: all.map((c) => c.id),
    selected: new Set(pre ? [pre] : (all.length === 1 ? [all[0].id] : [])),
  };
  if (pre) {
    const e = entryFor(pre, date);
    if (e) { entryDraft.motif = e.motif || ''; entryDraft.retenue = !!e.retenue; entryDraft.remuneree = !!e.remuneree; entryDraft.km = e.km ? String(e.km).replace('.', ',') : ''; }
    if (type === 'presence') { const s = slotAt(childById(pre), date); entryDraft.a = e?.a || (s ? s.a : ''); entryDraft.d = e?.d || (s ? s.d : ''); }
  }
  renderEntrySheet();
  sheet.hidden = false; backdrop.hidden = false;
  document.body.classList.add('sheet-open');
  sheet.scrollTop = 0;
  sheet.querySelector('h2')?.focus();
}
function closeSheet() {
  if (sheet.hidden) return;
  sheet.hidden = true; backdrop.hidden = true; entryDraft = null;
  document.body.classList.remove('sheet-open');
}

function renderEntrySheet() {
  const dft = entryDraft;
  const kids = dft.kids.map(childById).filter(Boolean);
  const typeBtn = (k) => `<button type="button" class="typebtn t-${k}" data-act="e-type" data-type="${k}" aria-pressed="${dft.type === k}">
      <span class="ic" aria-hidden="true">${TYPES[k].ic}</span><span>${TYPES[k].label}<small>${TYPES[k].help}</small></span></button>`;
  let h = `<div class="grab" aria-hidden="true"></div>
  <div class="sheet-head"><h2 id="sheetTitle" tabindex="-1">Saisir</h2><button class="iconbtn" data-act="close-sheet" aria-label="Fermer">✕</button></div>
  <h3>1. Que s'est-il passé ?</h3>
  <div class="typegrid ${dft.type ? 'chosen' : ''}">${Object.keys(TYPES).map(typeBtn).join('')}</div>`;
  if (dft.type) {
    h += `<h3 style="margin-top:18px">2. Pour quel(s) enfant(s) ?</h3>
    <div class="card" style="padding:6px 14px">
      ${kids.map((c) => `<label class="check">${avatar(c, true)}<span class="grow">${esc(c.prenom)}</span><input type="checkbox" data-act="e-kid" value="${c.id}" ${dft.selected.has(c.id) ? 'checked' : ''}></label>`).join('')}
      ${kids.length > 1 ? `<button type="button" class="btn small" style="margin:6px 0 8px" data-act="e-allkids">Tous les enfants</button>` : ''}
    </div>
    <h3 style="margin-top:18px">3. Quand ?</h3>
    <div class="seg" role="group" aria-label="Durée"><button type="button" data-act="e-mode" data-m="jour" aria-pressed="${dft.mode === 'jour'}">Un jour</button><button type="button" data-act="e-mode" data-m="periode" aria-pressed="${dft.mode === 'periode'}">Plusieurs jours</button></div>
    <div class="${dft.mode === 'periode' ? 'two' : ''}" style="margin-top:10px">
      <label class="field">${dft.mode === 'periode' ? 'Du' : 'Date'}<input type="date" data-act="e-field" data-k="from" value="${dft.from}"></label>
      ${dft.mode === 'periode' ? `<label class="field">Au (inclus)<input type="date" data-act="e-field" data-k="to" value="${dft.to}"></label>` : ''}
    </div>`;
    if (dft.type === 'presence') {
      h += `<details class="card fold" ${dft.a || dft.km ? 'open' : ''}><summary>⏱ Heures réelles et trajets (facultatif)</summary>
        <p class="note">Laissez vide pour reprendre le planning.</p>
        <div class="two"><label class="field">Arrivée<input type="time" data-act="e-field" data-k="a" value="${dft.a}"></label>
        <label class="field">Départ<input type="time" data-act="e-field" data-k="d" value="${dft.d}"></label></div>
        <label class="field">Kilomètres avec l'enfant<input inputmode="decimal" data-act="e-field" data-k="km" value="${esc(dft.km)}" placeholder="0"><span class="hint">Trajets en voiture demandés par les parents (par jour).</span></label></details>`;
    } else {
      if (dft.type === 'absence_enfant') h += illnessOptionHTML(dft);
      if (dft.type === 'absence_am') h += `<div class="card"><label class="check"><input type="checkbox" data-act="e-flag" data-k="remuneree" ${dft.remuneree ? 'checked' : ''}>
        <span>Absence payée (pas de déduction sur le salaire)<br><small class="muted">Ex. : congé pour événement familial (mariage, naissance, décès…). Laissez décoché si l'absence n'est pas payée (maladie, convenance…). Pour vos congés payés, choisissez « Congés ».</small></span></label></div>`;
      h += `<label class="field">Motif (facultatif)<input data-act="e-field" data-k="motif" maxlength="60" value="${esc(dft.motif)}" placeholder="${dft.type === 'absence_am' ? 'Ex. : formation, rendez-vous' : 'Ex. : vacances des parents'}">
        <span class="hint">Restez bref, sans détail médical.</span></label>`;
    }
    h += `<div id="effectBox">${effectPreview()}</div>`;
  }
  h += `<div class="sheet-foot"><button type="button" class="btn primary block" data-act="e-save" id="saveEntry">${dft.type ? 'Enregistrer' : 'Choisissez ce qui s’est passé'}</button></div>`;
  sheet.innerHTML = h;
  updateSaveState();
}

function draftDates() {
  const d = entryDraft;
  if (!d.from) return [];
  const to = d.mode === 'periode' ? d.to : d.from;
  if (!to || to < d.from) return [];
  const out = [];
  for (const ds of eachDay(d.from, to)) { out.push(ds); if (out.length > 370) break; }
  return out;
}
function computeEffect() {
  const d = entryDraft, dates = draftDates(), res = [];
  for (const id of d.selected) {
    const c = childById(id); if (!c) continue;
    const x = { c, planned: 0, plannedH: 0, unplanned: 0, outside: 0, overwrite: 0, realH: 0, apply: [] };
    for (const ds of dates) {
      if (!inContract(c, ds)) { x.outside++; continue; }
      const ph = plannedAt(c, ds);
      if (entryFor(c.id, ds)) x.overwrite++;
      if (ph > 0) { x.planned++; x.plannedH += ph; x.apply.push(ds); }
      else { x.unplanned++; if (d.type === 'presence' && d.a && d.d) x.apply.push(ds); }
      if (d.type === 'presence') x.realH += d.a && d.d ? hoursBetween(d.a, d.d) : ph;
    }
    res.push(x);
  }
  return res;
}
function effectPreview() {
  const d = entryDraft;
  if (!d.type) return '';
  if (!d.selected.size) return `<div class="effect"><strong>Choisissez au moins un enfant.</strong></div>`;
  if (!draftDates().length) return `<div class="effect t-absence_am"><strong>Vérifiez les dates</strong> (la fin doit être après le début).</div>`;
  if (d.type === 'presence' && (d.a || d.d) && !(d.a && d.d && hoursBetween(d.a, d.d) > 0)) return `<div class="effect t-absence_am"><strong>Heures incorrectes :</strong> le départ doit être après l'arrivée.</div>`;
  if (d.type === 'presence' && d.km && (num(d.km) == null || num(d.km) < 0)) return `<div class="effect t-absence_am"><strong>Kilomètres incorrects.</strong></div>`;
  let h = `<div class="effect t-${d.type}"><strong>Ce que ça change</strong><ul>`;
  for (const x of computeEffect()) {
    const n = x.planned, s = n > 1 ? 's' : '';
    let line = `<strong>${esc(x.c.prenom)}</strong> : `;
    if (d.type === 'presence') {
      line += x.apply.length ? `${jours(x.apply.length)} comptée${x.apply.length > 1 ? 's' : ''}, ${fmtH(x.realH)} de présence${d.km ? `, ${d.km} km par jour` : ''}.` : 'aucun jour prévu.';
      if (x.unplanned && !(d.a && d.d)) line += ` ${plural(x.unplanned, 'jour sans accueil prévu ignoré', 'jours sans accueil prévu ignorés')} (indiquez des heures pour compter un jour en plus).`;
      else if (x.unplanned) line += ` Dont ${plural(x.unplanned, 'jour en plus', 'jours en plus')} du planning.`;
    } else if (d.type === 'absence_enfant' && d.retenue) {
      line += n ? `${jours(n)} de maladie justifiée, <strong>non payée${s}</strong> : ni comptée${s} ni payée${s}.` : 'aucun jour prévu : aucun effet.';
      const u = illnessUsage(x.c, d.from, x.apply);
      if (u.warn) line += ` <br>⚠️ ${u.warn}`;
    } else if (d.type === 'absence_enfant') {
      line += n ? `<strong>${jours(n)} payée${s} et comptée${s}</strong> (${fmtH(x.plannedH)}), sans indemnité d'entretien.` : 'aucun jour prévu : aucun effet.';
    } else if (d.type === 'absence_am') {
      line += n ? `<strong>−${jours(n)}</strong> retirée${s} (${fmtH(-x.plannedH)})${d.remuneree ? ', <strong>sans déduction de salaire</strong>' : ', déduite' + s + ' du salaire'}.` : 'aucun jour prévu : aucun effet.';
    } else {
      line += n ? `${jours(n)} de congés, ${state.settings.congesMode === 'compte' ? 'comptée' + s + ' comme travaillée' + s : state.settings.congesMode === 'deduit' ? 'retirée' + s + ' du décompte' : 'ni comptée' + s + ' ni déduite' + s}, sans déduction de salaire.` : 'aucun jour prévu : aucun effet.';
    }
    if (x.outside) line += ` <small>(${plural(x.outside, 'jour hors contrat ignoré', 'jours hors contrat ignorés')})</small>`;
    if (x.overwrite) line += ` <small>⚠️ remplace ${plural(x.overwrite, 'saisie existante', 'saisies existantes')}.</small>`;
    h += `<li>${line}</li>`;
  }
  return h + `</ul></div>`;
}

/* Maladie de l'enfant justifiée (art. 105 CCN, L423-20 CASF) : retenue possible sur décision des parents,
 * 5 jours de courtes absences ou 14 jours consécutifs par période de 12 mois depuis le début du contrat. */
function contractYear(child, ds) {
  const [, m0, d0] = child.debut.split('-').map(Number);
  let y = +ds.slice(0, 4);
  let start = `${y}-${pad(m0)}-${pad(d0)}`;
  if (start > ds) { y -= 1; start = `${y}-${pad(m0)}-${pad(d0)}`; }
  return { start, end: addDays(`${y + 1}-${pad(m0)}-${pad(d0)}`, -1) };
}
function illnessUsage(child, ds, extraDates = []) {
  const { start, end } = contractYear(child, ds);
  const dates = new Set(state.entries.filter((e) => e.childId === child.id && e.type === 'absence_enfant' && e.retenue && e.date >= start && e.date <= end && plannedAt(child, e.date) > 0).map((e) => e.date));
  for (const d of extraDates) if (d >= start && d <= end) dates.add(d);
  const runs = [];
  for (const d of [...dates].sort()) {
    const r = runs[runs.length - 1];
    if (r && nextPlannedGap(child, r.to, d)) { r.to = d; r.n++; } else runs.push({ from: d, to: d, n: 1 });
  }
  let courts = 0, longues = 0;
  for (const r of runs) { if (Math.round((fromDS(r.to) - fromDS(r.from)) / 864e5) + 1 >= 14) longues++; else courts += r.n; }
  const warn = courts > 5 ? `${courts} jours de courtes absences non payées du ${fmtShortYear(start)} au ${fmtShortYear(end)} : au-delà de 5, ces jours sont en principe dus (à vérifier avec les parents).` : '';
  return { start, end, courts, longues, warn };
}
function illnessOptionHTML(dft) {
  const kid = [...dft.selected].map(childById).find(Boolean);
  let info = '';
  if (kid && dft.from) { const u = illnessUsage(kid, dft.from); info = `<br><small class="muted">${esc(kid.prenom)} : ${u.courts} jour(s) déjà utilisés du ${fmtShortYear(u.start)} au ${fmtShortYear(u.end)} (limite : 5).</small>`; }
  return `<div class="card"><label class="check"><input type="checkbox" data-act="e-flag" data-k="retenue" ${dft.retenue ? 'checked' : ''}>
    <span>Maladie avec justificatif : les parents ne paient pas<br><small class="muted">Possible sur décision des parents : 5 jours de courtes absences au plus, ou une absence de 14 jours consécutifs, par période de 12 mois. Sinon, laissez décoché : la journée reste payée.</small>${info}</span></label></div>`;
}

function updateSaveState() {
  const btn = document.getElementById('saveEntry');
  if (!btn) return;
  const d = entryDraft;
  if (!d.type) { btn.disabled = true; return; }
  const badTime = d.type === 'presence' && (d.a || d.d) && !(d.a && d.d && hoursBetween(d.a, d.d) > 0);
  const badKm = d.type === 'presence' && d.km && (num(d.km) == null || num(d.km) < 0);
  btn.disabled = !d.selected.size || !draftDates().length || badTime || badKm || computeEffect().every((x) => !x.apply.length);
}

/** Modifie des saisies avec possibilité d'annuler (bouton « Annuler » dans le message). */
function withUndo(keys, mutate, msg) {
  const snap = keys.map(([c, d]) => entryFor(c, d)).filter(Boolean).map((e) => ({ ...e }));
  mutate();
  save();
  refresh();
  toast(msg, () => {
    for (const [c, d] of keys) removeEntry(c, d, true);
    state.entries.push(...snap);
    save(); refresh(); toast('Modification annulée');
  });
}

function saveEntry() {
  const d = entryDraft;
  const fx = computeEffect();
  const keys = [];
  for (const x of fx) for (const ds of x.apply) keys.push([x.c.id, ds]);
  closeSheet();
  withUndo(keys, () => {
    for (const x of fx) for (const ds of x.apply) {
      const data = { type: d.type };
      if (d.type === 'presence' && d.a && d.d) { data.a = d.a; data.d = d.d; }
      if (d.type === 'presence' && num(d.km)) data.km = num(d.km);
      if (d.type !== 'presence' && d.motif.trim()) data.motif = d.motif.trim().slice(0, 60);
      if (d.type === 'absence_enfant' && d.retenue) data.retenue = true;
      if (d.type === 'absence_am' && d.remuneree) data.remuneree = true;
      setEntry(x.c.id, ds, data);
    }
  }, `${TYPES[d.type].label} : ${plural(keys.length, 'jour enregistré', 'jours enregistrés')}`);
}

function quickSet(childId, ds, type) {
  const c = childById(childId);
  const ph = plannedAt(c, ds);
  if (type === 'presence' && ph <= 0) { openEntry({ type: 'presence', childId, date: ds }); return; }
  if (type !== 'presence' && ph <= 0) { toast('Pas d’accueil prévu ce jour : aucun effet'); return; }
  const cur = entryFor(childId, ds);
  if (cur && cur.type === type) {
    if (cur.a || cur.km || cur.retenue || cur.remuneree || cur.motif) { toast('Déjà enregistré avec des détails : touchez « ⋯ » pour modifier'); return; }
    withUndo([[childId, ds]], () => removeEntry(childId, ds, true), `${c.prenom} : saisie retirée`);
    return;
  }
  withUndo([[childId, ds]], () => setEntry(childId, ds, { type }), `${c.prenom} : ${TYPES[type].label.toLowerCase()}`);
}
function confirmDays(list) {
  const keys = list.map((p) => [p.c.id, p.ds]);
  withUndo(keys, () => { for (const p of list) setEntry(p.c.id, p.ds, { type: 'presence' }); }, `${plural(list.length, 'journée confirmée', 'journées confirmées')}`);
}

/* ======================= 6. Dialogues, bienvenue, taille du texte ======================= */

/** Fenêtre de confirmation de l'application (remplace confirm/alert). Retourne une promesse. */
function showDialog({ title, message, ok = 'OK', cancel = 'Annuler', danger = false, extra = null }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-backdrop';
    wrap.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlgT">
      <h2 id="dlgT">${esc(title)}</h2><p>${esc(message)}</p>
      <div class="btn-row">${cancel ? `<button class="btn" data-r="cancel">${esc(cancel)}</button>` : ''}${extra ? `<button class="btn" data-r="extra">${esc(extra)}</button>` : ''}
      <button class="btn ${danger ? 'danger solid' : 'primary'}" data-r="ok">${esc(ok)}</button></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('[data-r="ok"]').focus();
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b && e.target !== wrap) return;
      const r = b ? b.dataset.r : 'cancel';
      wrap.remove();
      resolve(r === 'ok' ? true : r === 'extra' ? 'extra' : false);
    });
  });
}

const WELCOME = [
  ['👋', 'Bienvenue', 'NounouRepère suit les journées, les heures et les absences de chaque enfant, et prépare vos récapitulatifs.'],
  ['✓', 'Ne notez que les exceptions', 'Les jours prévus au planning comptent tout seuls. Notez seulement ce qui change : une absence, des heures en plus. Le soir, un bouton « Tout s’est passé comme prévu » suffit.'],
  ['🧒👩', 'Deux absences bien différentes', '🧒 Enfant absent : la journée est payée et comptée. 👩 Nounou absente : la journée est retirée et déduite. Ne les confondez pas.'],
  ['💾', 'Vos données restent ici', 'Tout est enregistré uniquement dans ce téléphone. Faites une sauvegarde chaque mois depuis Réglages.'],
];
function showWelcome(i = 0) {
  document.querySelector('.welcome')?.remove();
  const [ic, t, p] = WELCOME[i];
  const w = document.createElement('div');
  w.className = 'dialog-backdrop welcome';
  w.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="wT">
    <div class="wicon" aria-hidden="true">${ic}</div><h2 id="wT">${t}</h2><p>${p}</p>
    <div class="wdots" aria-hidden="true">${WELCOME.map((_, j) => `<span class="${j === i ? 'on' : ''}"></span>`).join('')}</div>
    <div class="btn-row">${i > 0 ? '<button class="btn" data-w="prev">‹ Retour</button>' : '<button class="btn" data-w="skip">Passer</button>'}
    <button class="btn primary" data-w="next">${i < WELCOME.length - 1 ? 'Suivant ›' : 'Commencer'}</button></div></div>`;
  document.body.appendChild(w);
  w.querySelector('[data-w="next"]').focus();
  w.addEventListener('click', (e) => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    if (b.dataset.w === 'prev') return showWelcome(i - 1);
    if (b.dataset.w === 'next' && i < WELCOME.length - 1) return showWelcome(i + 1);
    w.remove(); state.settings.onboarded = true; save();
  });
}
function applyTextSize() {
  document.documentElement.style.fontSize = { normal: '18px', grand: '20px', tres_grand: '22px' }[state.settings.textSize] || '18px';
}

/* ======================= 7. Export, sauvegarde, événements ======================= */

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function exportCSV() {
  const y = ui.recapYear;
  const kids = (ui.recapChild === 'all' ? sortedChildren() : [childById(ui.recapChild)]).filter((c) => c && totalsTouches(c, y));
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const eur = (v) => (v == null ? '' : decFR(v));
  const lines = [q('RÉCAPITULATIF MENSUEL ' + y)];
  lines.push(['Enfant', 'Mois', 'Jours prévus', 'Jours comptés', 'dont présences', 'dont absences enfant', 'Jours déduits (nounou absente)', 'Jours de congés', 'Heures prévues', 'Heures de présence', 'Heures comptées', 'Heures déduites', 'Semaines comptées', 'Km', 'Salaire net estimé (€)', 'Salaire brut estimé (€)', 'Entretien (€)', 'Repas (€)', 'Frais km (€)', 'Salaire net déclaré (€)'].map(q).join(';'));
  for (const c of kids) {
    const pa = hasTarif(c) ? payYear(c, y) : null;
    for (let m = 1; m <= 12; m++) {
      const t = periodTotals.month(c, y, m);
      const p = pa ? pa.months[m - 1] : null, ok = p && p.ok;
      const dec = (c.declared || {})[`${y}-${pad(m)}`] || {};
      lines.push([c.prenom, MOIS[m], t.joursPrevus, t.joursComptes, t.joursPresence, t.joursAbsEnfant, t.joursAbsAM, t.joursConges, hDecimal(t.heuresPrevues), hDecimal(t.heuresRealisees), hDecimal(t.heuresRetenues), hDecimal(t.heuresDeduites), t.semainesComptees, hDecimal(t.km),
        ok && p.net ? eur(p.net.total) : '', ok && p.brut ? eur(p.brut.total) : '', ok ? eur(p.entretien) : '', ok ? eur(p.repas) : '', ok ? eur(p.km) : '', dec.net != null ? eur(dec.net) : ''].map(q).join(';'));
    }
    const t = periodTotals.year(c, y);
    lines.push([c.prenom, 'TOTAL ' + y, t.joursPrevus, t.joursComptes, t.joursPresence, t.joursAbsEnfant, t.joursAbsAM, t.joursConges, hDecimal(t.heuresPrevues), hDecimal(t.heuresRealisees), hDecimal(t.heuresRetenues), hDecimal(t.heuresDeduites), t.semainesComptees, hDecimal(t.km),
      pa && pa.hasNet ? eur(pa.net) : '', pa && pa.hasBrut ? eur(pa.brut) : '', pa ? eur(pa.entretien) : '', pa ? eur(pa.repas) : '', pa ? eur(pa.km) : '', ''].map(q).join(';'));
  }
  lines.push('', q('DÉTAIL JOUR PAR JOUR ' + y));
  lines.push(['Date', 'Enfant', 'Statut', 'Heures prévues', 'Heures de présence', 'Heures comptées', 'Heures déduites', 'Journée comptée', 'Journée déduite', 'Km', 'Motif'].map(q).join(';'));
  for (const c of kids) {
    const s = maxDS(c.debut, `${y}-01-01`), e = minDS(c.fin || `${y}-12-31`, `${y}-12-31`);
    for (const ds of eachDay(s, e)) {
      const r = dayInfo(c, ds);
      if (r.status === 'non_prevu' || r.status === 'hors') continue;
      lines.push([ds.split('-').reverse().join('/'), c.prenom, statusLabel(r), hDecimal(r.planned), hDecimal(r.real), hDecimal(r.retained), hDecimal(r.deducted), r.counted ? 'oui' : 'non', r.deductedDay ? 'oui' : 'non', hDecimal(r.km), r.entry?.motif || ''].map(q).join(';'));
    }
  }
  lines.push('', q('Heures en décimal (7,5 = 7 h 30). Montants estimés à partir des saisies (à comparer avec Pajemploi). Ce fichier n’est pas un calcul fiscal.'));
  download(`NounouRepere-recap-${y}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('Fichier enregistré dans Téléchargements');
}

async function backup() {
  const name = `NounouRepere-sauvegarde-${todayDS()}.json`;
  const content = JSON.stringify({ app: 'NounouRepère', exportedAt: new Date().toISOString(), ...state }, null, 2);
  const file = typeof File === 'function' ? new File([content], name, { type: 'application/json' }) : null;
  let done = false;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    const r = await showDialog({ title: 'Où ranger la sauvegarde ?', message: 'Vous pouvez l’envoyer vers Google Drive, par e-mail à vous-même, dans Fichiers… ou simplement l’enregistrer dans Téléchargements.', ok: 'Choisir où l’envoyer', cancel: 'Annuler', extra: 'Téléchargements' });
    if (r === false) return;
    if (r === true) {
      try { await navigator.share({ files: [file], title: 'Sauvegarde NounouRepère' }); done = true; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  if (!done) download(name, content, 'application/json');
  state.settings.lastBackup = new Date().toISOString();
  save(); toast('Sauvegarde créée'); renderSettings();
}

function restore(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let data;
    try { data = JSON.parse(reader.result); if (!Array.isArray(data.children) || !Array.isArray(data.entries)) throw new Error('format'); }
    catch (e) { showDialog({ title: 'Fichier non reconnu', message: 'Ce fichier n’est pas une sauvegarde NounouRepère valide.', ok: 'Compris', cancel: null }); return; }
    const ok = await showDialog({ title: 'Restaurer cette sauvegarde ?', message: `${data.children.length} fiche(s) et ${data.entries.length} saisie(s). Les données actuelles de ce téléphone seront remplacées.`, ok: 'Restaurer', danger: true });
    if (!ok) return;
    state = normalize(data); state.settings.onboarded = true;
    save(); applyTextSize(); toast('Sauvegarde restaurée');
    location.hash = '#/accueil'; route();
  };
  reader.readAsText(f);
  input.value = '';
}

function toast(msg, undo) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" class="toast-undo">Annuler</button>' : ''}`;
  t.hidden = false;
  if (undo) t.querySelector('.toast-undo').onclick = () => { t.hidden = true; undo(); };
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, undo ? 6000 : 2600);
}

function shiftAnchor(ds, unit, n) {
  if (unit === 'day') return addDays(ds, n);
  if (unit === 'week') return addDays(ds, 7 * n);
  const [y, m] = ds.split('-').map(Number);
  if (unit === 'year') return `${y + n}-${pad(m)}-01`;
  return toDS(new Date(Date.UTC(y, m - 1 + n, 1)));
}

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'file' || (el.tagName === 'INPUT' && el.type !== 'button')) return;
  const a = el.dataset.act;
  const today = todayDS();
  switch (a) {
    case 'open-entry': openEntry({ type: el.dataset.type, childId: el.dataset.id, date: el.dataset.date }); break;
    case 'close-sheet': closeSheet(); break;
    case 'goto-day': ui.calView = 'jour'; ui.calDate = el.dataset.date; location.hash === '#/calendrier' ? route() : (location.hash = '#/calendrier'); break;
    case 'cal-view': ui.calView = el.dataset.v; renderCalendar(); break;
    case 'cal-filter': ui.calChild = el.dataset.id; renderCalendar(); break;
    case 'cal-nav': ui.calDate = shiftAnchor(ui.calDate, { jour: 'day', semaine: 'week', mois: 'month' }[ui.calView], +el.dataset.d); renderCalendar(); break;
    case 'cal-today': ui.calDate = today; renderCalendar(); break;
    case 'cal-child': ui.calChild = el.dataset.id; ui.calView = 'mois'; ui.calDate = today; location.hash = '#/calendrier'; break;
    case 'recap-child': ui.recapChild = el.dataset.id; location.hash = '#/recap'; break;
    case 'child-period': ui.childPeriod = el.dataset.p; renderChild(location.hash.split('/')[2]); break;
    case 'child-nav': ui.childAnchor = shiftAnchor(ui.childAnchor, ui.childPeriod, +el.dataset.d); renderChild(location.hash.split('/')[2]); break;
    case 'quick': quickSet(el.dataset.id, el.dataset.date, el.dataset.type); break;
    case 'clear-day': withUndo([[el.dataset.id, el.dataset.date]], () => removeEntry(el.dataset.id, el.dataset.date, true), 'Saisie effacée : retour au planning'); break;
    case 'confirm-today': confirmDays(sortedChildren().filter((c) => isActive(c) && plannedAt(c, today) > 0 && !entryFor(c.id, today)).map((c) => ({ c, ds: today }))); break;
    case 'confirm-day': confirmDays([{ c: childById(el.dataset.id), ds: el.dataset.date }]); break;
    case 'confirm-pending': confirmDays(pendingDays(today, 14)); break;
    case 'am-absent-today': {
      const list = sortedChildren().filter((c) => isActive(c) && plannedAt(c, today) > 0);
      withUndo(list.map((c) => [c.id, today]), () => { for (const c of list) setEntry(c.id, today, { type: 'absence_am' }); }, `Absence enregistrée pour ${plural(list.length, 'enfant', 'enfants')}`);
      break;
    }
    case 'form-step': {
      const form = document.getElementById('childForm');
      const d = +el.dataset.d;
      if (d > 0) { const r = validateChildForm(form, null, ui.formStep); if (r.error) { document.getElementById('formError').textContent = r.error; return; } }
      ui.formStep = Math.min(3, Math.max(1, ui.formStep + d));
      showStep(ui.formStep);
      break;
    }
    case 'del-version': {
      const c = childById(el.dataset.id);
      const v = lastVersion(c);
      if (await showDialog({ title: 'Supprimer ce changement ?', message: `Le contrat redeviendra celui d’avant le ${fmtShortYear(v.from)}.`, ok: 'Supprimer', danger: true })) {
        c.versions.pop(); save(); refresh(); toast('Changement supprimé');
      }
      break;
    }
    case 'text-size': state.settings.textSize = el.dataset.v; save(); applyTextSize(); renderSettings(); break;
    case 'show-welcome': showWelcome(0); break;
    case 'fis-smic-add': case 'fis-smic-del': onFiscalClick(el); break;
    case 'month-share': shareMonth(el.dataset.id, el.dataset.ym); break;
    case 'month-copy': copyMonth(el.dataset.id, el.dataset.ym); break;
    case 'print': window.print(); break;
    case 'reset-refs': delete state.settings.refs; save(); toast('Repères de juin 2026 rétablis'); renderSettings(); break;
    case 'export-csv': exportCSV(); break;
    case 'backup': backup(); break;
    case 'wipe':
      if (await showDialog({ title: 'Tout supprimer ?', message: 'Toutes les fiches et saisies de ce téléphone seront effacées.', ok: 'Continuer', danger: true })
        && await showDialog({ title: 'Dernière confirmation', message: 'Cette suppression est définitive. Avez-vous une sauvegarde ?', ok: 'Tout supprimer', danger: true })) {
        localStorage.removeItem(STORE_KEY); state = emptyState(); state.settings.onboarded = true; save(); toast('Données supprimées'); location.hash = '#/accueil'; route();
      }
      break;
    case 'delete-child': {
      const c = childById(el.dataset.id);
      if (c && await showDialog({ title: `Supprimer la fiche de ${c.prenom} ?`, message: 'La fiche et toutes ses saisies seront effacées. Action définitive.', ok: 'Supprimer', danger: true })) {
        state.children = state.children.filter((x) => x.id !== c.id);
        state.entries = state.entries.filter((e) => e.childId !== c.id);
        save(); toast('Fiche supprimée'); location.hash = '#/enfants';
      }
      break;
    }
    case 'e-type':
      entryDraft.type = el.dataset.type;
      if ((entryDraft.type === 'absence_am' || entryDraft.type === 'conges') && !entryDraft.selected.size) entryDraft.kids.forEach((id) => entryDraft.selected.add(id));
      if (entryDraft.type === 'presence' && entryDraft.selected.size === 1 && !entryDraft.a) {
        const s = slotAt(childById([...entryDraft.selected][0]), entryDraft.from);
        if (s) { entryDraft.a = s.a; entryDraft.d = s.d; }
      }
      renderEntrySheet(); break;
    case 'e-mode': entryDraft.mode = el.dataset.m; if (entryDraft.mode === 'periode' && entryDraft.to <= entryDraft.from) entryDraft.to = addDays(entryDraft.from, 4); renderEntrySheet(); break;
    case 'e-allkids': entryDraft.kids.forEach((id) => entryDraft.selected.add(id)); renderEntrySheet(); break;
    case 'e-save': saveEntry(); break;
  }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  const a = el.dataset && el.dataset.act;
  if (!a) return;
  if (a.startsWith('fis-')) { onFiscalChange(el); return; }
  if (a === 'decl') { onDeclaredChange(el); return; }
  if (a === 'recap-year') { ui.recapYear = +el.value; renderRecap(); }
  else if (a === 'recap-month') { ui.recapMonth = +el.value; renderRecap(); }
  else if (a === 'recap-child') { ui.recapChild = el.value; renderRecap(); }
  else if (a === 'set') { state.settings[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.value; save(); toast('Réglage enregistré'); }
  else if (a === 'set-ref') {
    const k = el.dataset.key;
    const v = k === 'refDate' ? el.value : num(el.value);
    if (v == null || v === '' || (k !== 'refDate' && v <= 0)) { toast('Valeur incorrecte'); return; }
    state.settings.refs = { ...(state.settings.refs || {}), [k]: v };
    save(); toast('Repère enregistré');
  } else if (a === 'restore') restore(el);
  else if (a === 'e-flag') { entryDraft[el.dataset.k] = el.checked; renderEntrySheet(); }
  else if (a === 'e-kid') { el.checked ? entryDraft.selected.add(el.value) : entryDraft.selected.delete(el.value); refreshEffect(); }
});
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset?.act !== 'e-field' || !entryDraft) return;
  entryDraft[el.dataset.k] = el.value;
  if (el.dataset.k === 'from' && entryDraft.mode === 'jour') entryDraft.to = el.value;
  refreshEffect();
});
function refreshEffect() { const b = document.getElementById('effectBox'); if (b) b.innerHTML = effectPreview(); updateSaveState(); }

backdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
window.addEventListener('hashchange', () => route());
window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) { state = load(); rebuildIndex(); route(); } });

// Démarrage (après le chargement des autres modules)
document.addEventListener('DOMContentLoaded', () => {
  applyTextSize();
  route();
  if (!state.settings.onboarded) showWelcome(0);
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

// Exposé pour les tests automatisés uniquement.
window.__nr = { dayInfo, totals, periodTotals, get state() { return state; }, payMonth: (...a) => payMonth(...a), payYear: (...a) => payYear(...a), versionAt, plannedAt, normalize };
