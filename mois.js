/* NounouRepère — Fiche du mois à partager avec les parents (texte, PDF ou impression). */
'use strict';

function monthData(c, ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = monthFirst(y, m), last = monthLast(y, m);
  const t = periodTotals.month(c, y, m);
  const p = hasTarif(c) ? payMonth(c, y, m) : null;
  const ents = state.entries.filter((e) => e.childId === c.id && e.date >= first && e.date <= last).sort((a, b) => a.date.localeCompare(b.date));
  const byType = (type, f = () => true) => ents.filter((e) => e.type === type && f(e) && plannedAt(c, e.date) > 0).map((e) => e.date);
  const extra = ents.filter((e) => e.type === 'presence' && (e.a || e.km)).map((e) => ({ ds: e.date, r: dayInfo(c, e.date) }));
  return { y, m, t, p, v: versionAt(c, maxDS(first, c.debut)),
    absEnfant: byType('absence_enfant', (e) => !e.retenue), absEnfantNonPaye: byType('absence_enfant', (e) => e.retenue),
    absNounou: byType('absence_am'), conges: byType('conges'), extra };
}
const datesList = (arr) => (arr.length ? arr.map((d) => fmtDate(d, { weekday: 'short', day: 'numeric' })).join(', ') : '—');

function renderMonthSheet(childId, ym) {
  const c = childById(childId);
  if (!c || !/^\d{4}-\d{2}$/.test(ym || '')) { location.hash = '#/enfants'; return; }
  setTitle(`Fiche du mois`, true);
  const D = monthData(c, ym);
  const { t, p } = D;
  const prev = shiftAnchor(`${ym}-01`, 'month', -1).slice(0, 7), next = shiftAnchor(`${ym}-01`, 'month', 1).slice(0, 7);
  const L = (label, val, cls = '') => `<tr class="${cls}"><th>${label}</th><td>${val}</td></tr>`;
  let h = `<div class="no-print">
    <div class="calnav"><a class="iconbtn navbtn" href="#/mois/${c.id}/${prev}" aria-label="Mois précédent">‹</a>
      <div class="title">${MOIS[D.m]} ${D.y}</div>
      <a class="iconbtn navbtn" href="#/mois/${c.id}/${next}" aria-label="Mois suivant">›</a></div>
    <div class="btn-row" style="margin-top:0">
      <button class="btn primary" data-act="month-share" data-id="${c.id}" data-ym="${ym}">📤 Partager</button>
      <button class="btn" data-act="print">🖨️ PDF</button>
      <button class="btn" data-act="month-copy" data-id="${c.id}" data-ym="${ym}">📋 Copier</button>
    </div>
    <p class="note">Partager : envoie le texte par SMS, WhatsApp, e-mail… PDF : choisissez « Enregistrer au format PDF ».</p></div>
  <article class="card monthsheet">
    <div class="ms-head"><img src="logo.svg" alt="NounouRepère" class="ms-logo"><div><h1>${esc(c.prenom)}</h1><p>Récapitulatif de ${MOIS[D.m]} ${D.y}</p></div></div>
    <table class="kv">
      <tr class="sep"><th colspan="2">Accueil</th></tr>
      ${L('Contrat', `${fmtH(versionWeeklyHours(D.v))}/sem.${D.v.horairesB ? ' (A/B)' : ''}${D.v.semainesContrat ? ` · ${D.v.semainesContrat} sem./an` : ''}`)}
      ${L('Journées prévues', t.joursPrevus)}
      ${L('Journées de présence', t.joursPresence)}
      ${L('Absences de l’enfant (payées)', `${t.joursAbsEnfant}<br><small>${datesList(D.absEnfant)}</small>`)}
      ${D.absEnfantNonPaye.length ? L('Absences pour maladie non payées', `${D.absEnfantNonPaye.length}<br><small>${datesList(D.absEnfantNonPaye)}</small>`, 'neg') : ''}
      ${L('Absences de la nounou', `${D.absNounou.length}<br><small>${datesList(D.absNounou)}</small>`, D.absNounou.length ? 'neg' : '')}
      ${D.conges.length ? L('Congés', `${D.conges.length}<br><small>${datesList(D.conges)}</small>`) : ''}
      ${t.joursFeries ? L('Jours fériés chômés', t.joursFeries) : ''}
      ${L('Heures de présence', fmtH(t.heuresRealisees))}
      ${t.heuresSupp ? L('Heures en plus du planning', fmtH(t.heuresSupp)) : ''}
      ${t.km ? L('Kilomètres avec l’enfant', `${hDecimal(t.km)} km`) : ''}`;
  if (p && p.ok) {
    const n = p.net || p.brut, lab = p.net ? 'net' : 'brut';
    h += `<tr class="sep"><th colspan="2">Montants estimés</th></tr>
      ${L(`Salaire mensuel ${lab}`, euro(n.base))}
      ${n.retenue ? L('Déduction (absences non payées)', '−' + euro(n.retenue), 'neg') : ''}
      ${n.comp ? L(`Heures complémentaires (${fmtH(p.hComp)})`, '+' + euro(n.comp)) : ''}
      ${n.maj ? L(`Heures majorées (${fmtH(p.hMaj)})`, '+' + euro(n.maj)) : ''}
      ${L(`<strong>Salaire ${lab} du mois</strong>`, `<strong>${euro(n.total)}</strong>`)}
      ${L(`Indemnité d’entretien (${p.joursPresents} j)`, euro(p.entretien))}
      ${p.repas ? L('Repas / goûters', euro(p.repas)) : ''}
      ${p.km ? L('Frais kilométriques', euro(p.km)) : ''}
      ${p.net ? L('<strong>Total à verser</strong>', `<strong>${euro(p.totalVerse)}</strong>`) : ''}
      <tr class="sep"><th colspan="2">Pour la déclaration Pajemploi</th></tr>
      ${L('Heures mensualisées', `${decFR(p.heuresMensu)} h`)}
      ${L('Jours d’activité (indicatif)', decFR(p.joursMensu))}
      ${p.hComp || p.hMaj ? L('Heures complémentaires / majorées', `${decFR(p.hComp)} h / ${decFR(p.hMaj)} h`) : ''}`;
  }
  h += `</table>
    ${D.extra.length ? `<h3>Détail des journées modifiées</h3><ul class="list">${D.extra.map(({ ds, r }) => `<li>${fmtDate(ds)} : ${r.entry.a ? `${r.entry.a} → ${r.entry.d} (${fmtH(r.real)})` : ''}${r.km ? ` · ${hDecimal(r.km)} km` : ''}</li>`).join('')}</ul>` : ''}
    <p class="note">Document établi avec NounouRepère le ${fmtShortYear(todayDS())}. Montants estimés à partir du suivi : seuls les montants déclarés sur Pajemploi font foi.${p && p.partiel ? ' Mois en cours : les jours à venir ne sont pas encore comptés.' : ''}</p>
  </article>
  ${p && p.ok ? '' : `<p class="note no-print">Ajoutez le salaire horaire dans la fiche de ${esc(c.prenom)} pour faire apparaître les montants.</p>`}`;
  app.innerHTML = h;
}

function monthText(c, ym) {
  const D = monthData(c, ym);
  const { t, p } = D;
  const lines = [`${c.prenom} — récapitulatif de ${MOIS[D.m]} ${D.y}`, ''];
  lines.push(`Journées prévues : ${t.joursPrevus}`, `Présences : ${t.joursPresence}`);
  lines.push(`Absences de l'enfant (payées) : ${t.joursAbsEnfant}${D.absEnfant.length ? ` (${datesList(D.absEnfant)})` : ''}`);
  if (D.absEnfantNonPaye.length) lines.push(`Absences pour maladie non payées : ${D.absEnfantNonPaye.length} (${datesList(D.absEnfantNonPaye)})`);
  if (D.absNounou.length) lines.push(`Absences de la nounou : ${D.absNounou.length} (${datesList(D.absNounou)})`);
  if (D.conges.length) lines.push(`Congés : ${D.conges.length} (${datesList(D.conges)})`);
  if (t.heuresSupp) lines.push(`Heures en plus du planning : ${fmtH(t.heuresSupp)}`);
  if (t.km) lines.push(`Kilomètres : ${hDecimal(t.km)} km`);
  if (p && p.ok) {
    const n = p.net || p.brut, lab = p.net ? 'net' : 'brut';
    lines.push('', `Salaire ${lab} estimé : ${euro(n.total)}${n.retenue ? ` (dont déduction ${euro(n.retenue)})` : ''}`);
    lines.push(`Indemnité d'entretien : ${euro(p.entretien)} (${p.joursPresents} jours)`);
    if (p.repas) lines.push(`Repas / goûters : ${euro(p.repas)}`);
    if (p.km) lines.push(`Frais kilométriques : ${euro(p.km)}`);
    if (p.net) lines.push(`Total à verser : ${euro(p.totalVerse)}`);
    lines.push('', `Pajemploi : ${decFR(p.heuresMensu)} h mensualisées${p.hComp || p.hMaj ? `, ${decFR(p.hComp)} h complémentaires, ${decFR(p.hMaj)} h majorées` : ''}.`);
  }
  lines.push('', 'Montants estimés avec NounouRepère ; seuls les montants déclarés sur Pajemploi font foi.');
  return lines.join('\n');
}
async function shareMonth(id, ym) {
  const c = childById(id);
  const text = monthText(c, ym);
  if (navigator.share) {
    try { await navigator.share({ title: `${c.prenom} — ${ym}`, text }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  copyMonth(id, ym);
}
async function copyMonth(id, ym) {
  const text = monthText(childById(id), ym);
  try { await navigator.clipboard.writeText(text); toast('Texte copié : collez-le dans un message'); }
  catch (e) { showDialog({ title: 'Copie impossible', message: 'Votre navigateur bloque la copie. Utilisez « Partager » ou « PDF ».', ok: 'Compris', cancel: null }); }
}
