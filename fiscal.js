/* NounouRepère — Aide au calcul de l'abattement fiscal (régime spécifique, art. 80 sexies du CGI).
 * Module SÉPARÉ du suivi et de la paie. Rien n'est calculé tant que l'utilisatrice n'a pas validé
 * les paramètres de l'année (SMIC horaire par période, évaluation des repas fournis par les parents).
 *
 * Règle (impots.gouv.fr, page modifiée le 20/07/2026, revenus 2025) :
 *  part imposable = rémunérations + indemnités d'entretien et d'hébergement (+ repas fournis par les parents)
 *                   − 3 × SMIC horaire par jour de garde effective et par enfant (4 × pour un enfant ouvrant droit
 *                   à une majoration de salaire) ; proratisé si la garde dure moins de 8 h : × heures ÷ 8.
 *  La déduction ne peut pas dépasser les sommes reçues. Option alternative : déclarer le salaire (sans abattement).
 */
'use strict';

// Valeurs proposées. 2025 : publiées par impots.gouv.fr. 2026 : SMIC officiel (info.gouv.fr), mais la valeur à
// retenir pour l'abattement des revenus 2026 ne sera confirmée par impots.gouv.fr qu'en 2027 → validation requise.
const FISCAL_PRESETS = {
  2025: { smic: [{ from: '2025-01-01', v: 11.88 }], repas: 5.45,
    note: 'Valeurs publiées par impots.gouv.fr (SMIC 11,88 € du 01/01 au 31/12/2025 ; repas fournis par les parents : 5,45 €/jour).' },
  2026: { smic: [{ from: '2026-01-01', v: 12.02 }, { from: '2026-06-01', v: 12.31 }], repas: null,
    note: 'SMIC horaire officiel 2026 (12,02 € au 1er janvier, 12,31 € au 1er juin, info.gouv.fr). Les montants à retenir pour la déclaration des revenus 2026 seront publiés par impots.gouv.fr en 2027 : à vérifier. Évaluation des repas 2026 : non publiée.' },
};

function fiscalYear(y) {
  const saved = (state.settings.fiscal || {})[y] || {};
  const preset = FISCAL_PRESETS[y] || { smic: [], repas: null, note: 'Aucune valeur proposée pour cette année : saisissez les montants publiés par impots.gouv.fr.' };
  return {
    smic: saved.smic || preset.smic.map((p) => ({ ...p })),
    repas: saved.repas !== undefined ? saved.repas : preset.repas,
    validated: !!saved.validated,
    percu: saved.percu ?? null,
    salaireSeul: saved.salaireSeul ?? null,
    note: preset.note,
  };
}
function saveFiscalYear(y, patch) {
  state.settings.fiscal = state.settings.fiscal || {};
  state.settings.fiscal[y] = { ...fiscalYear(y), ...(state.settings.fiscal[y] || {}), ...patch };
  delete state.settings.fiscal[y].note;
  save();
}
const childFiscal = (c) => ({ mult: 3, repasParents: false, ...(c.fiscal || {}) });

function smicAt(fy, ds) {
  let v = null;
  for (const p of [...fy.smic].sort((a, b) => a.from.localeCompare(b.from))) if (p.from <= ds) v = p.v;
  return v;
}

/** Jours de garde effective d'un enfant sur l'année, et abattement correspondant (si paramètres validés). */
function abattementEnfant(c, y, fy) {
  const cf = childFiscal(c);
  const s = maxDS(`${y}-01-01`, c.debut), e = minDS3(c.fin || `${y}-12-31`, `${y}-12-31`, todayDS());
  const out = { jours: 0, joursCourts: 0, abattement: 0, repasJours: 0, manqueSmic: false, mult: cf.mult };
  if (s > e) return out;
  for (const ds of eachDay(s, e)) {
    const r = dayInfo(c, ds);
    if (!r.effective || r.real <= 0) continue; // garde effective seulement (enfant présent)
    out.jours++;
    if (r.real < 8) out.joursCourts++;
    if (cf.repasParents) out.repasJours++;
    const smic = smicAt(fy, ds);
    if (smic == null) { out.manqueSmic = true; continue; }
    out.abattement += cf.mult * smic * Math.min(r.real, 8) / 8;
  }
  out.abattement = r2(out.abattement);
  return out;
}
// minDS à 3 arguments
function minDS3(a, b, c) { return [a, b, c].sort()[0]; }

function fiscalHelperHTML(list, y) {
  const fy = fiscalYear(y);
  const rows = list.map((c) => ({ c, a: abattementEnfant(c, y, { ...fy, smic: fy.smic }) }));
  const totalAbatt = r2(rows.reduce((s, x) => s + x.a.abattement, 0));
  const repasEval = fy.repas != null ? r2(rows.reduce((s, x) => s + x.a.repasJours, 0) * fy.repas) : null;
  const needRepas = rows.some((x) => x.a.repasJours) && fy.repas == null;
  let h = `<section class="card child-recap" id="fiscal" style="margin-top:20px"><h2>🧮 Aide au calcul de l'abattement ${y}</h2>
    <p class="muted">Régime spécifique des assistants maternels (art. 80 sexies du code général des impôts). Outil d'aide : il ne remplace pas la notice officielle et ne constitue pas un conseil fiscal.</p>`;

  // Étape 1 : paramètres
  h += `<h3>1. Paramètres de l'année ${fy.validated ? '<span class="badge t-presence"><span class="ic">✓</span>validés</span>' : '<span class="badge t-absence_enfant"><span class="ic">!</span>à valider</span>'}</h3>
    <p class="note">${esc(fy.note)}</p>
    <div class="no-print">`;
  fy.smic.forEach((p, i) => {
    h += `<div class="two"><label class="field">SMIC horaire à partir du<input type="date" data-act="fis-smic-from" data-i="${i}" value="${p.from}"></label>
      <label class="field">Montant (€)<input inputmode="decimal" data-act="fis-smic-v" data-i="${i}" value="${decFR(p.v)}"></label></div>`;
  });
  h += `<div class="btn-row" style="margin-top:0"><button class="btn small" data-act="fis-smic-add">＋ Changement de SMIC</button>${fy.smic.length > 1 ? '<button class="btn small" data-act="fis-smic-del">Retirer le dernier</button>' : ''}</div>
    <label class="field" style="margin-top:12px">Évaluation d'un repas fourni par les parents (€ / jour)<input inputmode="decimal" data-act="fis-repas" value="${fy.repas == null ? '' : decFR(fy.repas)}" placeholder="montant publié par impots.gouv.fr"><span class="hint">Utilisé seulement pour les enfants dont les parents fournissent les repas.</span></label>
    <label class="check"><input type="checkbox" data-act="fis-validate" ${fy.validated ? 'checked' : ''}><span>J'ai vérifié ces valeurs avec les informations officielles de l'année (impots.gouv.fr)</span></label></div>
    <p class="print-only">SMIC retenu : ${fy.smic.map((p) => `${decFR(p.v)} € à partir du ${fmtShortYear(p.from)}`).join(' ; ')}${fy.repas != null ? ` · repas fournis par les parents : ${decFR(fy.repas)} €/jour` : ''}</p>`;

  // Étape 2 : par enfant
  h += `<h3>2. Jours de garde effective</h3>
    <p class="note">Jours où l'enfant était présent (les absences payées n'ouvrent pas droit à l'abattement, qui est lié à la garde effective). Garde de moins de 8 h : abattement proratisé (× heures ÷ 8).</p>
    <div class="tablewrap"><table class="recap" style="min-width:600px"><thead><tr><th>Enfant</th><th>Jours de garde</th><th>dont &lt; 8 h</th><th>Coefficient</th><th>Repas fournis par les parents</th><th>Abattement</th></tr></thead><tbody>`;
  for (const { c, a } of rows) {
    h += `<tr><td>${esc(c.prenom)}</td><td>${a.jours}</td><td>${a.joursCourts}</td>
      <td><select data-act="fis-mult" data-id="${c.id}" aria-label="Coefficient ${esc(c.prenom)}" style="min-height:40px;margin:0;padding:4px 8px;width:auto"><option value="3" ${a.mult === 3 ? 'selected' : ''}>3 × SMIC</option><option value="4" ${a.mult === 4 ? 'selected' : ''}>4 × SMIC (majoration)</option></select></td>
      <td><input type="checkbox" data-act="fis-repas-parents" data-id="${c.id}" ${childFiscal(c).repasParents ? 'checked' : ''} aria-label="Repas fournis par les parents pour ${esc(c.prenom)}"></td>
      <td>${fy.validated && !a.manqueSmic ? euro(a.abattement) : '—'}</td></tr>`;
  }
  h += `</tbody></table></div>
    <p class="note">« 4 × SMIC » : seulement pour un enfant ouvrant droit à une majoration de salaire (prévue au contrat). Les gardes de 24 h consécutives (5 × SMIC) ne sont pas gérées par l'application.</p>`;

  // Étape 3 : sommes perçues
  const estim = list.reduce((s, c) => { if (!hasTarif(c)) return s; const p = payYear(c, y); return s + (p.hasNet ? p.net : 0) + p.entretien + p.repas; }, 0);
  h += `<h3>3. Sommes perçues en ${y}</h3>
    <label class="field">Total des rémunérations et indemnités (entretien, repas…) perçues<input inputmode="decimal" data-act="fis-percu" value="${fy.percu == null ? '' : decFR(fy.percu)}" placeholder="d'après vos relevés Pajemploi">
      <span class="hint">Reprenez les montants de vos relevés / bulletins Pajemploi (rémunérations nettes de cotisations et de CSG déductible, plus les indemnités). ${estim ? `Pour comparaison, estimation de l'application : ${euro(r2(estim))} (salaire net versé + indemnités ; ce n'est pas la base fiscale exacte).` : ''}</span></label>
    <label class="field">Salaire imposable seul, sans les indemnités (facultatif)<input inputmode="decimal" data-act="fis-salaire" value="${fy.salaireSeul == null ? '' : decFR(fy.salaireSeul)}" placeholder="pour comparer avec l'option « salaire »"></label>`;

  // Étape 4 : résultat
  h += `<h3>4. Résultat</h3>`;
  const blockers = [];
  if (!fy.validated) blockers.push('validez les paramètres de l’année (étape 1)');
  if (rows.some((x) => x.a.manqueSmic)) blockers.push('indiquez un SMIC couvrant toute la période');
  if (needRepas) blockers.push('indiquez l’évaluation des repas fournis par les parents');
  if (fy.percu == null) blockers.push('indiquez le total des sommes perçues (étape 3)');
  if (blockers.length) {
    h += `<div class="card warn"><p><strong>Calcul en attente :</strong> ${blockers.join(' ; ')}.</p></div>`;
  } else {
    const base = r2(fy.percu + (repasEval || 0));
    const deduc = Math.round(Math.min(totalAbatt, base));
    const imposable = Math.max(0, Math.round(base) - deduc);
    h += `<table class="kv">
      <tr><th>Sommes perçues<span class="expl">Montant saisi${repasEval ? ` + repas fournis par les parents (${euro(repasEval)})` : ''}</span></th><td>${euro(base)}</td></tr>
      <tr><th>Abattement (part exonérée)<span class="expl">Total des abattements par enfant, plafonné aux sommes perçues, arrondi à l'euro. À reporter en case 1GA ou 1HA selon la situation familiale.</span></th><td>${euro(deduc)}</td></tr>
      <tr><th><strong>Part imposable — option régime spécifique</strong><span class="expl">À inscrire dans les cases « traitements et salaires » (1AA à 1DA si l'employeur est un particulier), à la place du montant prérempli.</span></th><td><strong>${euro(imposable)}</strong></td></tr>
      ${fy.salaireSeul != null ? `<tr><th>Option « salaire »<span class="expl">Salaire imposable sans les indemnités et sans abattement.</span></th><td>${euro(fy.salaireSeul)}</td></tr>
      <tr><th>Option la plus faible ici<span class="expl">À confirmer : l'impôt dépend de l'ensemble du foyer.</span></th><td>${imposable <= fy.salaireSeul ? 'régime spécifique' : 'salaire'}</td></tr>` : ''}
    </table>`;
  }
  h += `<details class="help"><summary>Ce qu'il faut vérifier</summary><ul>
      <li>Le SMIC horaire à retenir pour l'année et ses changements en cours d'année (publiés par impots.gouv.fr au moment de la déclaration).</li>
      <li>Les sommes perçues : se fier aux relevés Pajemploi, pas aux estimations de l'application.</li>
      <li>Les jours de garde : l'application compte les jours de présence saisis ou prévus au planning (jours passés sans saisie = présence selon le planning si ce réglage est activé).</li>
      <li>Les cases exactes du formulaire de l'année et la situation du foyer.</li>
    </ul><p class="note">Source : impots.gouv.fr, « Je suis assistant(e) maternel(le). Comment dois-je déclarer mes revenus ? » (modifiée le 20/07/2026, consultée le 19/11/2026).</p></details></section>`;
  return h;
}

function onFiscalChange(el) {
  const y = ui.recapYear, fy = fiscalYear(y), a = el.dataset.act;
  if (a === 'fis-smic-from' || a === 'fis-smic-v') {
    const smic = fy.smic.map((p) => ({ ...p }));
    const i = +el.dataset.i;
    if (a === 'fis-smic-from') smic[i].from = el.value; else { const v = num(el.value); if (v == null || v <= 0) return toast('Montant incorrect'); smic[i].v = v; }
    saveFiscalYear(y, { smic, validated: false });
  } else if (a === 'fis-repas') {
    const v = el.value.trim() === '' ? null : num(el.value);
    if (el.value.trim() !== '' && (v == null || v < 0)) return toast('Montant incorrect');
    saveFiscalYear(y, { repas: v, validated: false });
  } else if (a === 'fis-validate') saveFiscalYear(y, { validated: el.checked, smic: fy.smic, repas: fy.repas });
  else if (a === 'fis-percu' || a === 'fis-salaire') {
    const v = el.value.trim() === '' ? null : num(el.value);
    if (el.value.trim() !== '' && (v == null || v < 0)) return toast('Montant incorrect');
    saveFiscalYear(y, a === 'fis-percu' ? { percu: v } : { salaireSeul: v });
  } else if (a === 'fis-mult' || a === 'fis-repas-parents') {
    const c = childById(el.dataset.id);
    c.fiscal = { ...childFiscal(c), ...(a === 'fis-mult' ? { mult: +el.value } : { repasParents: el.checked }) };
    save();
  } else return false;
  renderRecap();
  document.getElementById('fiscal')?.scrollIntoView({ block: 'start' });
  return true;
}
function onFiscalClick(el) {
  const y = ui.recapYear, fy = fiscalYear(y), a = el.dataset.act;
  if (a === 'fis-smic-add') {
    const last = fy.smic[fy.smic.length - 1];
    saveFiscalYear(y, { smic: [...fy.smic, { from: last ? addDays(last.from, 1) : `${y}-01-01`, v: last ? last.v : 0 }], validated: false });
  } else if (a === 'fis-smic-del') saveFiscalYear(y, { smic: fy.smic.slice(0, -1), validated: false });
  else return false;
  renderRecap();
  document.getElementById('fiscal')?.scrollIntoView({ block: 'start' });
  return true;
}
