/* NounouRepère — Tarifs et paie ESTIMÉE (module séparé du suivi).
 *
 * Règles (convention collective IDCC 3239, fiches DREETS 2024–2026 — voir regles.js) :
 *  - Salaire mensuel : taux horaire × heures par semaine × (52 en année complète, ou semaines programmées) ÷ 12.
 *    En alternance A/B, les heures par semaine sont la moyenne des deux semaines.
 *  - Absences non payées (nounou absente, maladie justifiée de l'enfant avec retenue, jours hors contrat) :
 *      année complète   : salaire mensuel × heures non travaillées ÷ heures qui auraient été travaillées dans le mois
 *      année incomplète : même calcul en jours.
 *  - Heures en plus : complémentaires jusqu'à 45 h/semaine, majorées au-delà (au moins 10 %).
 *  - Entretien : seulement les jours de présence ; minimum 90 % du minimum garanti pour 9 h, proratisé, plancher.
 *  - Repas et frais kilométriques : montants du contrat.
 * Ce sont des ESTIMATIONS : les montants officiels sont ceux déclarés sur Pajemploi.
 * Chaque mois est calculé avec la version du contrat en vigueur au début du mois (ou au début de l'accueil).
 */
'use strict';

const DEFAULT_REFS = { refDate: '2026-06-01', mg: 4.35, plancher: 2.65, minBrut: 4.20, minNet: 3.28, seuilMajore: 45 };
const refs = () => ({ ...DEFAULT_REFS, ...(state.settings.refs || {}) });
const num = (v) => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.').replace(/\s/g, '')); return Number.isFinite(n) ? n : null; };
const euro = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
const r2 = (v) => Math.round(v * 100 + (v >= 0 ? 1e-6 : -1e-6)) / 100;
const decFR = (v, d = 2) => (v == null ? '' : String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ','));

/** Tarif d'une version du contrat, avec valeurs par défaut. */
function tarifOf(v) {
  const t = (v && v.tarif) || {};
  const sem = +(v && v.semainesContrat) || null;
  return {
    typeAnnee: t.typeAnnee || (sem && sem <= 46 ? 'incomplete' : 'complete'),
    tauxNet: num(t.tauxNet), tauxBrut: num(t.tauxBrut),
    majComp: num(t.majComp) ?? 0, majMaj: num(t.majMaj) ?? 10,
    entretienMode: t.entretienMode || 'auto', entretienFixe: num(t.entretienFixe),
    repas: num(t.repas) ?? 0, gouter: num(t.gouter) ?? 0, kmRate: num(t.kmRate) ?? 0,
  };
}
const hasTarifV = (v) => { const t = tarifOf(v); return t.tauxNet != null || t.tauxBrut != null; };
const hasTarif = (c) => c.versions.some(hasTarifV);
const tarif = (c, ds) => tarifOf(ds ? versionAt(c, ds) : currentVersion(c));

/* Minimum conventionnel (art. 114-1) : moins de 9 h → forfait (plancher, 2,65 €) quelle que soit la durée ;
 * 9 h et plus → 90 % du minimum garanti pour 9 h, proratisé à l'heure. Proratiser aussi en dessous de 9 h
 * n'est possible que si le contrat le prévoit (mode 'prorata'). */
const entretienProrata = (h) => { const R = refs(); return r2(Math.max(R.plancher, (0.9 * R.mg / 9) * h)); };
const entretienMinimum = (h) => (h < 9 ? refs().plancher : entretienProrata(h));
function entretienJour(t, h) {
  if (t.entretienMode === 'fixe' && t.entretienFixe != null) return t.entretienFixe;
  if (t.entretienMode === 'prorata') return entretienProrata(h);
  return entretienMinimum(h);
}

/** Heures en plus du planning, réparties par semaine en complémentaires / majorées (au-delà de 45 h). */
function heuresEnPlus(c, from, to) {
  const seuil = refs().seuilMajore;
  let comp = 0, maj = 0;
  for (let mo = mondayOf(from); mo <= to; mo = addDays(mo, 7)) {
    const days = [];
    let total = 0, extraW = 0;
    for (let i = 0; i < 7; i++) {
      const ds = addDays(mo, i);
      const r = dayInfo(c, ds);
      total += r.retained; extraW += r.extra;
      if (r.extra) days.push({ ds, extra: r.extra });
    }
    let majLeft = Math.min(extraW, Math.max(0, total - seuil));
    for (let i = days.length - 1; i >= 0; i--) {
      const m = Math.min(days[i].extra, majLeft);
      majLeft -= m;
      if (days[i].ds < from || days[i].ds > to) continue;
      maj += m; comp += days[i].extra - m;
    }
  }
  return { comp, maj };
}

/** Paie estimée d'un enfant pour un mois. */
function payMonth(c, y, m) {
  const first = monthFirst(y, m), last = monthLast(y, m);
  const out = { ok: false, warnings: [], y, m };
  if (!(c.debut <= last && (!c.fin || c.fin >= first))) return out;
  const v = versionAt(c, maxDS(first, c.debut));
  if (!hasTarifV(v)) return out;
  const t = tarifOf(v);
  out.t = t; out.version = v;
  const sem = t.typeAnnee === 'complete' ? 52 : (+v.semainesContrat || null);
  const hHebdo = versionWeeklyHours(v);
  out.hHebdo = hHebdo; out.sem = sem;
  if (!sem) out.warnings.push('Nombre de semaines au contrat manquant (année incomplète).');
  if (hHebdo > refs().seuilMajore) out.warnings.push(`Contrat de plus de ${refs().seuilMajore} h par semaine : la majoration incluse dans le salaire mensuel n'est pas calculée.`);
  if (c.versions.some((x) => x.from > first && x.from <= last)) out.warnings.push('Le contrat change en cours de mois : ce mois est calculé avec le contrat en vigueur au début du mois.');
  if (v.horairesB) out.warnings.push('Horaires en alternance A/B : salaire calculé sur la moyenne des deux semaines.');
  out.heuresMensu = sem ? (hHebdo * sem) / 12 : 0;
  out.joursMensu = sem ? (versionWeeklyDays(v) * sem) / 12 : 0;

  // Absences non payées et jours hors contrat
  let prevuH = 0, prevuJ = 0, absH = 0, absJ = 0, horsH = 0, horsJ = 0;
  const today = todayDS();
  for (const ds of eachDay(first, last)) {
    const ph = plannedAt(c, ds);
    if (ph <= 0) continue;
    const e = entryFor(c.id, ds);
    if (t.typeAnnee === 'incomplete' && e && e.type === 'conges' && inContract(c, ds)) continue; // semaines non programmées
    prevuH += ph; prevuJ += 1;
    if (!inContract(c, ds)) { horsH += ph; horsJ += 1; continue; }
    if (e && ((e.type === 'absence_am' && !e.remuneree) || (e.type === 'absence_enfant' && e.retenue))) { absH += ph; absJ += 1; }
  }
  Object.assign(out, { prevuH, prevuJ, absH, absJ, horsH, horsJ });
  const ratio = t.typeAnnee === 'complete' ? (prevuH ? (absH + horsH) / prevuH : 0) : (prevuJ ? (absJ + horsJ) / prevuJ : 0);
  out.ratio = Math.min(1, ratio);

  const s = maxDS(first, c.debut), e = c.fin ? minDS(last, c.fin) : last;
  const hp = s <= e ? heuresEnPlus(c, s, e) : { comp: 0, maj: 0 };
  out.hComp = hp.comp; out.hMaj = hp.maj;

  let joursPresents = 0, entretien = 0, sousMinimum = 0, km = 0;
  for (const ds of eachDay(s, e)) {
    const r = dayInfo(c, ds, today);
    km += r.km;
    if (!r.effective) continue;
    joursPresents++;
    const val = entretienJour(t, r.real);
    entretien += val;
    if (val + 1e-9 < entretienMinimum(r.real)) sousMinimum++;
  }
  out.joursPresents = joursPresents;
  out.entretien = r2(entretien);
  out.repas = r2(joursPresents * (t.repas + t.gouter));
  out.kmTotal = km;
  out.km = r2(km * t.kmRate);
  if (sousMinimum) out.warnings.push(`Indemnité d'entretien fixe inférieure au minimum sur ${sousMinimum} jour(s).`);
  if (km && !t.kmRate) out.warnings.push(`${decFR(km)} km saisis, mais aucun tarif kilométrique dans le contrat.`);

  const calc = (taux) => {
    if (taux == null) return null;
    const base = r2(taux * out.heuresMensu);
    const retenue = r2(base * out.ratio);
    const comp = r2(out.hComp * taux * (1 + t.majComp / 100));
    const maj = r2(out.hMaj * taux * (1 + t.majMaj / 100));
    return { base, retenue, comp, maj, total: r2(base - retenue + comp + maj) };
  };
  out.net = calc(t.tauxNet);
  out.brut = calc(t.tauxBrut);
  if (t.tauxNet != null && t.tauxNet < refs().minNet) out.warnings.push(`Taux net inférieur au minimum conventionnel (${euro(refs().minNet)}).`);
  if (t.tauxBrut != null && t.tauxBrut < refs().minBrut) out.warnings.push(`Taux brut inférieur au minimum conventionnel (${euro(refs().minBrut)}).`);
  out.indemnites = r2(out.entretien + out.repas + out.km);
  out.totalVerse = out.net ? r2(out.net.total + out.indemnites) : null;
  out.declared = (c.declared || {})[`${y}-${pad(m)}`] || {};
  out.partiel = last > today;
  out.ok = true;
  return out;
}

function payYear(c, y) {
  const acc = { net: 0, brut: 0, entretien: 0, repas: 0, km: 0, retenueNet: 0, joursPresents: 0, hasNet: false, hasBrut: false, months: [], declNet: 0, hasDecl: false };
  for (let m = 1; m <= 12; m++) {
    const p = payMonth(c, y, m);
    acc.months.push(p);
    if (!p.ok) continue;
    if (p.net) { acc.net += p.net.total; acc.retenueNet += p.net.retenue; acc.hasNet = true; }
    if (p.brut) { acc.brut += p.brut.total; acc.hasBrut = true; }
    acc.entretien += p.entretien; acc.repas += p.repas; acc.km += p.km; acc.joursPresents += p.joursPresents;
    if (p.declared.net != null) { acc.declNet += p.declared.net; acc.hasDecl = true; }
  }
  for (const k of ['net', 'brut', 'entretien', 'repas', 'km', 'retenueNet', 'declNet']) acc[k] = r2(acc[k]);
  return acc;
}

/* ----------------------- Affichage ----------------------- */

/** Bloc « Tarifs » du formulaire enfant (raw = tarif enregistré de la version). */
function tarifFormHTML(raw) {
  const t = tarifOf({ tarif: raw, semainesContrat: null });
  const R = refs();
  const v = (k) => esc(typeof raw[k] === 'number' ? decFR(raw[k]) : (raw[k] ?? ''));
  return `<p class="muted">Facultatif, mais nécessaire pour estimer la paie. Reprenez les montants du contrat.</p>
    <fieldset class="radios"><legend>Type d'accueil</legend>
      <label class="check"><input type="radio" name="typeAnnee" value="complete" ${t.typeAnnee === 'complete' ? 'checked' : ''}><span>Année complète<br><small class="muted">47 semaines d'accueil ou plus : salaire sur 52 semaines</small></span></label>
      <label class="check"><input type="radio" name="typeAnnee" value="incomplete" ${t.typeAnnee === 'incomplete' ? 'checked' : ''}><span>Année incomplète<br><small class="muted">46 semaines ou moins</small></span></label>
    </fieldset>
    <div class="two">
      <label class="field">Salaire horaire net<input name="tauxNet" inputmode="decimal" value="${v('tauxNet')}" placeholder="ex. 3,90"><span class="hint">€ / heure</span></label>
      <label class="field">Salaire horaire brut<input name="tauxBrut" inputmode="decimal" value="${v('tauxBrut')}" placeholder="facultatif"><span class="hint">€ / heure</span></label>
    </div>
    <p class="note">Minimum au ${fmtShortYear(R.refDate)} : ${euro(R.minBrut)} brut / ${euro(R.minNet)} net par heure et par enfant.</p>
    <fieldset class="radios"><legend>Indemnité d'entretien (par jour de présence)</legend>
      <label class="check"><input type="radio" name="entretienMode" value="auto" ${t.entretienMode === 'auto' ? 'checked' : ''}><span>Minimum de la convention<br><small class="muted">${euro(R.plancher)} par jour en dessous de 9 h ; ${euro(r2(0.9 * R.mg))} pour 9 h, puis ${euro(r2(0.9 * R.mg / 9))} par heure en plus</small></span></label>
      <label class="check"><input type="radio" name="entretienMode" value="prorata" ${t.entretienMode === 'prorata' ? 'checked' : ''}><span>Proratisé à l'heure, même en dessous de 9 h<br><small class="muted">Seulement si le contrat le prévoit : ${euro(r2(0.9 * R.mg / 9))} par heure, jamais moins de ${euro(R.plancher)}</small></span></label>
      <label class="check"><input type="radio" name="entretienMode" value="fixe" ${t.entretienMode === 'fixe' ? 'checked' : ''}><span>Montant fixe prévu au contrat</span></label>
    </fieldset>
    <label class="field">Montant fixe par jour<input name="entretienFixe" inputmode="decimal" value="${v('entretienFixe')}" placeholder="ex. 4,00"><span class="hint">€ / jour — seulement si « Montant fixe »</span></label>
    <div class="two">
      <label class="field">Repas fourni<input name="repas" inputmode="decimal" value="${v('repas')}" placeholder="0"><span class="hint">€ / jour de présence</span></label>
      <label class="field">Goûter fourni<input name="gouter" inputmode="decimal" value="${v('gouter')}" placeholder="0"><span class="hint">€ / jour de présence</span></label>
    </div>
    <details class="fold-inner"><summary>Options avancées (majorations, kilomètres)</summary>
      <div class="two">
        <label class="field">Majoration heures compl.<input name="majComp" inputmode="decimal" value="${v('majComp')}" placeholder="0"><span class="hint">% (souvent 0)</span></label>
        <label class="field">Majoration > ${R.seuilMajore} h/sem.<input name="majMaj" inputmode="decimal" value="${v('majMaj')}" placeholder="10"><span class="hint">% (10 % minimum)</span></label>
      </div>
      <label class="field">Indemnité kilométrique<input name="kmRate" inputmode="decimal" value="${v('kmRate')}" placeholder="ex. 0,32"><span class="hint">€ / km, si vous transportez l'enfant à la demande des parents (montant du contrat, entre le barème de l'administration et le barème fiscal).</span></label>
    </details>
    <div class="effect" id="mensuPreview"></div>`;
}

function readTarifForm(form) {
  const g = (n) => (form[n] ? form[n].value.trim() : '');
  const t = {
    typeAnnee: (form.querySelector('input[name="typeAnnee"]:checked') || {}).value || 'complete',
    entretienMode: (form.querySelector('input[name="entretienMode"]:checked') || {}).value || 'auto',
  };
  for (const k of ['tauxNet', 'tauxBrut', 'majComp', 'majMaj', 'entretienFixe', 'repas', 'gouter', 'kmRate']) {
    const s = g(k);
    if (s === '') continue;
    const n = num(s);
    if (n == null || n < 0) return { error: `Valeur incorrecte : « ${s} ». Utilisez un nombre, par exemple 3,90.` };
    t[k] = n;
  }
  if (t.majMaj != null && t.majMaj < 10) return { error: 'La majoration au-delà de 45 h ne peut pas être inférieure à 10 %.' };
  if (t.entretienMode === 'fixe' && t.entretienFixe == null) return { error: 'Indiquez le montant fixe de l’indemnité d’entretien, ou choisissez le minimum légal.' };
  return { tarif: t };
}

function mensuPreview(form, hHebdo) {
  const box = document.getElementById('mensuPreview');
  if (!box) return;
  const type = (form.querySelector('input[name="typeAnnee"]:checked') || {}).value;
  const semC = parseInt(form.semainesContrat.value, 10);
  const sem = type === 'complete' ? 52 : semC;
  const taux = num(form.tauxNet.value), brut = num(form.tauxBrut.value);
  if (!hHebdo) { box.innerHTML = 'Indiquez les horaires pour voir le salaire mensuel.'; return; }
  if (!sem) { box.innerHTML = '<strong>Année incomplète :</strong> indiquez le nombre de semaines au contrat (étape Horaires).'; return; }
  const h = (hHebdo * sem) / 12;
  let txt = `<strong>Heures par mois :</strong> ${fmtH(hHebdo)} × ${sem} sem. ÷ 12 = <strong>${fmtH(h)}</strong>`;
  if (taux != null) txt += `<br><strong>Salaire mensuel net :</strong> ${euro(r2(taux * h))}`;
  if (brut != null) txt += `<br><strong>Salaire mensuel brut :</strong> ${euro(r2(brut * h))}`;
  if (type === 'complete' && semC && semC < 47) txt += `<br>⚠️ ${semC} semaines au contrat : c'est en principe une année incomplète.`;
  if (type === 'incomplete' && semC >= 47) txt += `<br>⚠️ ${semC} semaines : c'est en principe une année complète.`;
  box.innerHTML = txt;
}

/** Carte « Paie estimée » d'un mois : total visible, détail et comparaison Pajemploi repliables. */
function payCardHTML(c, y, m) {
  if (!hasTarif(c)) {
    return `<div class="card"><h2>💶 Paie estimée</h2><p>Ajoutez le salaire horaire dans la fiche pour estimer la paie du mois.</p>
      <a class="btn small" href="#/enfant/${c.id}/modifier">Ajouter les tarifs</a></div>`;
  }
  const p = payMonth(c, y, m);
  if (!p.ok) return '';
  const L = (label, expl, val, cls = '') => `<tr class="${cls}"><th>${label}${expl ? `<span class="expl">${expl}</span>` : ''}</th><td>${val}</td></tr>`;
  const n = p.net, b = p.brut, main = n || b, lab = n ? 'net' : 'brut', taux = n ? p.t.tauxNet : p.t.tauxBrut;
  let h = `<details class="card fold paycard"><summary>💶 Paie estimée <span class="paysum">${euro(n ? p.totalVerse : main.total)}</span></summary><table class="kv">`;
  h += `<tr class="sep"><th colspan="2">Salaire (${lab})</th></tr>`;
  h += L('Salaire mensuel', `${euro(taux)} × ${fmtH(p.heuresMensu)} (${fmtH(p.hHebdo)} × ${p.sem} sem. ÷ 12)`, euro(main.base));
  if (main.retenue) {
    const expl = p.t.typeAnnee === 'complete' ? `${fmtH(p.absH + p.horsH)} non travaillées sur ${fmtH(p.prevuH)} prévues` : `${p.absJ + p.horsJ} jour(s) non travaillé(s) sur ${p.prevuJ} prévus`;
    h += L('Déduction (absences non payées)', `${expl} : nounou absente, maladie de l'enfant non payée${p.horsJ ? ', jours hors contrat' : ''}.`, '−' + euro(main.retenue), 'neg');
  }
  if (p.hComp) h += L('Heures complémentaires', `${fmtH(p.hComp)}${p.t.majComp ? ` majorées de ${decFR(p.t.majComp)} %` : ''}`, '+' + euro(main.comp));
  if (p.hMaj) h += L(`Heures au-delà de ${refs().seuilMajore} h/sem.`, `${fmtH(p.hMaj)} majorées de ${decFR(p.t.majMaj)} %`, '+' + euro(main.maj));
  h += L(`<strong>Salaire ${lab} du mois</strong>`, '', `<strong>${euro(main.total)}</strong>`);
  if (n && b) h += L('Salaire brut correspondant', '', euro(b.total));
  h += `<tr class="sep"><th colspan="2">Indemnités (non soumises à cotisations)</th></tr>`;
  h += L('Entretien', `${p.joursPresents} jour(s) de présence${p.t.entretienMode === 'fixe' ? ` × ${euro(p.t.entretienFixe)}` : p.t.entretienMode === 'prorata' ? ' · proratisé à l’heure' : ' · minimum de la convention'}`, euro(p.entretien));
  if (p.repas) h += L('Repas / goûters', `${p.joursPresents} jour(s) × ${euro(p.t.repas + p.t.gouter)}`, euro(p.repas));
  if (p.kmTotal) h += L('Frais kilométriques', `${decFR(p.kmTotal)} km × ${euro(p.t.kmRate)}`, euro(p.km));
  if (n) h += L('<strong>Total à percevoir</strong>', p.partiel ? 'Mois en cours : les jours à venir ne sont pas encore comptés.' : '', `<strong>${euro(p.totalVerse)}</strong>`);
  h += `</table>`;
  // Comparaison avec la déclaration Pajemploi des parents
  const d = p.declared, ym = `${y}-${pad(m)}`;
  const ecart = (decl, est) => (decl == null ? '' : `<span class="${Math.abs(decl - est) < 0.5 ? 'okv' : 'negv'}">écart ${decl - est >= 0 ? '+' : '−'}${euro(Math.abs(r2(decl - est)))}</span>`);
  h += `<div class="card tinted" style="margin:12px 0 0"><strong>Comparer avec Pajemploi</strong>
    <p class="note">Montants déclarés par les parents (relevé ou bulletin Pajemploi).</p>
    <div class="two">
      <label class="field">Salaire net déclaré<input inputmode="decimal" data-act="decl" data-id="${c.id}" data-ym="${ym}" data-k="net" value="${d.net != null ? decFR(d.net) : ''}" placeholder="€">${n ? ecart(d.net, n.total) : ''}</label>
      <label class="field">Entretien déclaré<input inputmode="decimal" data-act="decl" data-id="${c.id}" data-ym="${ym}" data-k="entretien" value="${d.entretien != null ? decFR(d.entretien) : ''}" placeholder="€">${ecart(d.entretien, p.entretien)}</label>
    </div></div>`;
  h += `<details class="help"><summary>Repères pour la déclaration Pajemploi</summary>
    <ul><li>Une déclaration par enfant (depuis le 25/01/2026).</li>
    <li>Heures mensualisées : <strong>${decFR(p.heuresMensu)}</strong> h</li>
    <li>Jours d'activité mensualisés : <strong>${decFR(p.joursMensu)}</strong> (indicatif : arrondi et mois avec absence à vérifier sur Pajemploi)</li>
    ${n ? `<li>Salaire net total : <strong>${euro(n.total)}</strong></li>` : ''}
    <li>Indemnités d'entretien : <strong>${euro(p.entretien)}</strong></li>
    ${p.repas ? `<li>Indemnités de repas : <strong>${euro(p.repas)}</strong></li>` : ''}
    ${p.km ? `<li>Indemnités kilométriques : <strong>${euro(p.km)}</strong></li>` : ''}
    ${p.hComp || p.hMaj ? `<li>Heures complémentaires : ${decFR(p.hComp)} h · majorées : ${decFR(p.hMaj)} h</li>` : ''}</ul></details>`;
  if (p.warnings.length) h += `<div class="card warn" style="margin:10px 0 0">${p.warnings.map((w) => `<p>⚠️ ${esc(w)}</p>`).join('')}</div>`;
  h += `<p class="note">Estimation à partir des saisies. Le montant officiel est celui de Pajemploi.</p></details>`;
  return h;
}

function onDeclaredChange(el) {
  const c = childById(el.dataset.id);
  const s = el.value.trim();
  const v = s === '' ? null : num(s);
  if (s !== '' && (v == null || v < 0)) { toast('Montant incorrect'); return; }
  c.declared = c.declared || {};
  const d = { ...(c.declared[el.dataset.ym] || {}) };
  if (v == null) delete d[el.dataset.k]; else d[el.dataset.k] = v;
  c.declared[el.dataset.ym] = d;
  save(); refresh(); toast('Montant déclaré enregistré');
  document.querySelector('.paycard')?.setAttribute('open', '');
}

function payRecapHTML(c, y) {
  if (!hasTarif(c)) return '';
  const a = payYear(c, y);
  const lab = a.hasNet ? 'net' : 'brut';
  let h = `<h3>Paie estimée ${y}</h3><div class="tablewrap"><table class="recap" style="min-width:720px"><thead><tr>
    <th>Mois</th><th>Salaire ${lab}</th><th>dont déductions</th><th>Entretien</th><th>Repas</th><th>Km</th><th>Jours de présence</th><th>Net déclaré</th><th>Écart</th></tr></thead><tbody>`;
  for (const p of a.months) {
    if (!p.ok) continue;
    const s = p.net || p.brut;
    const dn = p.declared.net;
    const ec = dn != null && p.net ? r2(dn - p.net.total) : null;
    h += `<tr><td>${MOIS[p.m]}</td><td>${euro(s.total)}</td><td class="${s.retenue ? 'col-neg' : ''}">${s.retenue ? '−' + euro(s.retenue) : '—'}</td><td>${euro(p.entretien)}</td><td>${euro(p.repas)}</td><td>${p.km ? euro(p.km) : '—'}</td><td>${p.joursPresents}</td>
      <td>${dn != null ? euro(dn) : '—'}</td><td class="${ec != null && Math.abs(ec) >= 0.5 ? 'col-neg' : ''}">${ec != null ? (ec >= 0 ? '+' : '−') + euro(Math.abs(ec)) : '—'}</td></tr>`;
  }
  h += `</tbody><tfoot><tr><td>Total ${y}</td><td>${euro(a.hasNet ? a.net : a.brut)}</td><td>${a.retenueNet ? '−' + euro(a.retenueNet) : '—'}</td><td>${euro(a.entretien)}</td><td>${euro(a.repas)}</td><td>${a.km ? euro(a.km) : '—'}</td><td>${a.joursPresents}</td><td>${a.hasDecl ? euro(a.declNet) : '—'}</td><td></td></tr></tfoot></table></div>
    <p class="note">Estimation. Congés payés versés en plus (année incomplète) et régularisations non inclus. « Net déclaré » : montants saisis depuis Pajemploi dans la fiche du mois.</p>`;
  return h;
}

function refsSettingsHTML() {
  const R = refs();
  const f = (k, label, hint) => `<label class="field">${label}<input inputmode="decimal" data-act="set-ref" data-key="${k}" value="${decFR(R[k])}"><span class="hint">${hint}</span></label>`;
  return `<details class="card fold"><summary>📏 Repères officiels</summary>
    <p class="muted">Servent aux minimums et alertes. Valeurs au ${fmtShortYear(R.refDate)} (DREETS, convention IDCC 3239). Mettez-les à jour quand ils changent.</p>
    <label class="field">En vigueur depuis le<input type="date" data-act="set-ref" data-key="refDate" value="${R.refDate}"></label>
    <div class="two">${f('mg', 'Minimum garanti', '€')}${f('plancher', 'Entretien minimum / jour', '€ (plancher)')}</div>
    <div class="two">${f('minBrut', 'Taux horaire minimum brut', '€ / h / enfant')}${f('minNet', 'Taux horaire minimum net', '€ / h / enfant')}</div>
    <button class="btn small" data-act="reset-refs">Revenir aux valeurs de juin 2026</button></details>`;
}
