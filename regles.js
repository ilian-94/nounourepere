/* NounouRepère — Règles utilisées et leurs sources (écran « Règles & sources »).
 * Consultation des sources : 19/11/2026. Chaque règle indique sa nature et la façon dont l'application l'applique.
 */
'use strict';

const CONSULTE = '19/11/2026';
const SOURCES = {
  dreetsPdl: { t: 'DREETS Pays de la Loire — Rémunération, indemnités et frais (fiche au 12/06/2026)', u: 'https://pays-de-la-loire.dreets.gouv.fr/sites/pays-de-la-loire.dreets.gouv.fr/IMG/pdf/fiche_remu_indemnites_frais_au_12062026.pdf' },
  dreetsNaq: { t: 'DREETS Nouvelle-Aquitaine — Indemnités d’entretien : quels montants prendre en compte ?', u: 'https://nouvelle-aquitaine.dreets.gouv.fr/sites/nouvelle-aquitaine.dreets.gouv.fr/IMG/pdf/QR_ASSMAT_SALAIRE_ABSENCES_3-1.pdf' },
  dreetsBfc: { t: 'DREETS Bourgogne-Franche-Comté — Guide assistants maternels (août 2026)', u: 'https://bourgogne-franche-comte.dreets.gouv.fr/sites/dreets-bourg-fc/files/2026-08/Assistante%20maternelles%20Maj%2006%202026.pdf' },
  sp: { t: 'Service-Public (DILA), « Salaire de l’assistante maternelle employée par un particulier employeur » (mise à jour 01/01/2026), publié sur justice.fr', u: 'https://www.justice.fr/fiche/salaire-assistante-maternelle-employee-particulier-employeur' },
  impots: { t: 'impots.gouv.fr — « Je suis assistant(e) maternel(le). Comment dois-je déclarer mes revenus ? » (modifiée le 20/07/2026)', u: 'https://www.impots.gouv.fr/particulier/questions/je-suis-assistante-maternelle-comment-dois-je-declarer-mes-revenus' },
  pajemploiCcn: { t: 'Bulletin info Pajemploi n°6 (janvier 2022) sur la convention collective', u: 'https://www.cdcvam.fr/sites/default/files/inline-files/Informations%20sur%20la%20nouvelle%20convention%20collective%20des%20particuliers%20employeurs%20et%20des%20Assistantes%20maternelles.pdf' },
  dreetsOccInc: { t: 'DREETS Occitanie — Accueil en année incomplète (19/01/2023)', u: 'https://occitanie.dreets.gouv.fr/sites/occitanie.dreets.gouv.fr/IMG/pdf/2023-01-19-fiche-accueil-en-annee-incomplete-version-definitive.pdf' },
  dreetsAraAbs: { t: 'DREETS Auvergne-Rhône-Alpes — Congés et absences (25/03/2024)', u: 'https://auvergne-rhone-alpes.dreets.gouv.fr/sites/auvergne-rhone-alpes.dreets.gouv.fr/IMG/pdf/assistants_maternels-conges_et_absences-ara-25-03-2024.pdf' },
  dreetsAraRem: { t: 'DREETS Auvergne-Rhône-Alpes — Rémunération (18/03/2024)', u: 'https://auvergne-rhone-alpes.dreets.gouv.fr/sites/auvergne-rhone-alpes.dreets.gouv.fr/IMG/pdf/assistants_maternels-remuneration-ara-18-03-2024.pdf' },
  smicJuin: { t: 'info.gouv.fr — Le SMIC revalorisé le 1er juin 2026', u: 'https://www.info.gouv.fr/public/index.php/actualite/le-smic-revalorise-le-1er-juin-2026' },
  smicJanv: { t: 'info.gouv.fr — Le SMIC revalorisé au 1er janvier 2026', u: 'https://www.info.gouv.fr/public/index.php/actualite/le-smic-revalorise-au-1er-janvier-2026' },
  bofip2007: { t: 'BOFiP (archives) — abattement des assistants maternels, SMIC par période (revenus 2007)', u: 'https://bofip-archives.impots.gouv.fr/export/pdf/354476' },
  urssafDecl: { t: 'Urssaf — Comment déclarer avec le service Pajemploi ?', u: 'https://www.urssaf.fr/accueil/services/services-particuliers/service-pajemploi/declarer-service-pajemploi.html' },
  pajemploiJours: { t: 'Pajemploi — Déclarer les jours d’activité (page ancienne)', u: 'https://www.pajemploi.urssaf.fr/pajewebinfo/cms/sites/pajewebinfo/accueil/employeur-dassistante-maternelle/je-remunere-et-je-declare/declarer-les-jours-dactivite.html' },
  pajemploiSalaire: { t: 'Pajemploi — Déclarer le salaire', u: 'https://www.pajemploi.urssaf.fr/portail/accueil/employeur-dassistante-maternelle/je-remunere-et-je-declare/declarer-le-salaire.html' },
};

// statut : 'auto' = calcul automatique sourcé ; 'choix' = choix saisie par saisie ou au contrat ;
//          'valider' = paramètre à valider avant calcul ; 'info' = affiché, non calculé.
const RULES = [
  { g: 'Rémunération', t: 'Salaire mensualisé', n: 'Conventionnel', s: 'auto',
    r: 'Salaire horaire × heures par semaine × 52 (année complète) ou × semaines programmées (année incomplète, 46 semaines ou moins) ÷ 12.',
    a: 'Calculé dans « Paie estimée » avec la version du contrat en vigueur au début du mois (historique daté). En alternance A/B : moyenne des deux semaines.', d: 'Le type d’année et le taux horaire viennent du contrat.', src: ['dreetsAraRem', 'dreetsBfc'] },
  { g: 'Rémunération', t: 'Taux horaire minimum', n: 'Légal et conventionnel', s: 'info',
    r: 'Au 1er juin 2026 : minimum légal 3,46 € brut (0,281 × SMIC) ; minimum conventionnel 4,20 € brut / 3,28 € net par heure et par enfant (4,37 € brut avec le titre « assistant maternel – garde d’enfants »).',
    a: 'Alerte si le taux saisi est inférieur. Valeurs modifiables dans Réglages › Repères officiels.', d: 'Titre professionnel de l’assistante maternelle.', src: ['dreetsPdl'] },
  { g: 'Rémunération', t: 'Heures complémentaires et majorées', n: 'Conventionnel + contrat', s: 'auto',
    r: 'Au-delà de la durée du contrat et jusqu’à 45 h par semaine : heures complémentaires au taux normal (majoration possible par accord écrit). Au-delà de 45 h : majoration fixée au contrat, au moins 10 %.',
    a: 'Calculées par semaine à partir des heures réelles saisies, avec les pourcentages de la fiche enfant.', d: 'Pourcentages du contrat. Contrats de plus de 45 h/semaine non gérés.', src: ['dreetsPdl', 'sp'] },
  { g: 'Absences', t: 'Absence de l’enfant', n: 'Conventionnel', s: 'auto',
    r: 'Les jours d’accueil prévus au contrat et non effectués du fait de l’absence de l’enfant sont rémunérés.',
    a: 'Journée comptée comme travaillée, salaire maintenu. Pas d’indemnité d’entretien ni de repas ce jour-là.', d: '—', src: ['dreetsBfc', 'sp'] },
  { g: 'Absences', t: 'Exception : maladie de l’enfant justifiée', n: 'Conventionnel (art. 105 CCN) et légal (art. L423-20 CASF)', s: 'choix',
    r: 'Sur justificatif (certificat médical ou bulletin d’hospitalisation), les parents peuvent ne pas rémunérer : 5 jours de courtes absences au plus (consécutifs ou non), ou une absence de 14 jours calendaires consécutifs, par période de 12 mois depuis le début du contrat ou sa date anniversaire. Au-delà, le salaire est dû.',
    a: 'Jamais automatique : case à cocher sur la saisie « Absence de l’enfant », avec compteur des jours déjà utilisés et alerte au-delà de 5.', d: 'Décision des parents et justificatif.', src: ['dreetsBfc', 'dreetsAraAbs', 'pajemploiCcn', 'sp'] },
  { g: 'Absences', t: 'Absence de l’assistante maternelle (non rémunérée)', n: 'Conventionnel (art. 111 CCN)', s: 'auto',
    r: 'Retenue = salaire mensualisé × heures non travaillées ÷ heures qui auraient été travaillées dans le mois (année complète) ; même calcul en jours en année incomplète.',
    a: 'Retenue calculée automatiquement ; journée retirée du décompte.', d: 'Motif de l’absence (voir règle suivante).', src: ['pajemploiCcn', 'dreetsBfc', 'dreetsOccInc'] },
  { g: 'Absences', t: 'Absences rémunérées de l’assistante maternelle', n: 'Conventionnel', s: 'choix',
    r: 'Certaines absences restent payées, par exemple les congés pour événements familiaux (mariage, naissance, décès…). D’autres ne le sont pas (maladie, convenance personnelle, maternité…).',
    a: 'Case « Absence rémunérée » sur la saisie « Absence de l’AM » : pas de retenue.', d: 'Motif et durée prévus par la convention.', src: ['dreetsBfc'] },
  { g: 'Absences', t: 'Début ou fin de contrat en cours de mois', n: 'Conventionnel', s: 'auto',
    r: 'Les jours avant l’embauche ou après la fin du contrat donnent lieu à la même retenue que les absences non rémunérées.',
    a: 'Retenue calculée automatiquement.', d: '—', src: ['dreetsOccInc'] },
  { g: 'Congés et fériés', t: 'Congés payés', n: 'Légal et conventionnel', s: 'info',
    r: '2,5 jours ouvrables acquis par mois (période du 1er juin au 31 mai). Indemnité = le plus favorable entre le maintien de salaire et 10 % de la rémunération brute de la période (hors indemnités). Année complète : compris dans le salaire mensualisé. Année incomplète : versés en plus (en juin, à la prise principale ou au fur et à mesure, selon le contrat).',
    a: 'Non calculés. Saisir « Congés » pour les jours de congé : ils ne sont jamais retenus sur le salaire. En année incomplète, les semaines non programmées saisies en « Congés » sont hors calcul.', d: 'Type d’année, dates et modalité de paiement du contrat.', src: ['dreetsBfc', 'sp'] },
  { g: 'Congés et fériés', t: 'Jours fériés', n: 'Conventionnel (art. 47 CCN)', s: 'info',
    r: '1er mai : chômé et payé s’il tombe un jour d’accueil. Autres jours fériés chômés : salaire maintenu si l’assistante maternelle a travaillé le dernier jour d’accueil avant et le premier après (sauf absence autorisée). Jour férié travaillé : prévu au contrat ou accepté, payé avec 10 % de majoration.',
    a: 'Affichés dans le calendrier, sans calcul automatique.', d: 'Contrat et présence avant/après le jour férié.', src: ['dreetsBfc', 'sp'] },
  { g: 'Indemnités', t: 'Indemnité d’entretien', n: 'Conventionnel (art. 114-1 CCN) et légal (art. L423-18 CASF)', s: 'auto',
    r: 'Minimum : en dessous de 9 h d’accueil, forfait de 2,65 € par jour quelle que soit la durée (les parties peuvent convenir au contrat de proratiser) ; à partir de 9 h, 90 % du minimum garanti pour 9 h (3,92 € au 1er juin 2026), puis 0,435 € par heure en plus. Due seulement les jours où l’enfant est accueilli. Montant fixé au contrat, au moins égal au minimum.',
    a: 'Trois choix dans la fiche : minimum de la convention (par défaut), proratisé à l’heure si le contrat le prévoit, ou montant fixe (alerte s’il est inférieur au minimum).', d: 'Montant du contrat ; minimum garanti modifiable dans Réglages.', src: ['dreetsPdl', 'dreetsNaq'] },
  { g: 'Indemnités', t: 'Frais de repas', n: 'Conventionnel (art. 114-2 CCN) + contrat', s: 'choix',
    r: 'Si l’assistante maternelle fournit les repas, une indemnité fixée au contrat est versée (pas de minimum). Si les parents fournissent les repas, aucune indemnité n’est due.',
    a: 'Montant par jour de présence saisi dans la fiche enfant (0 si les parents fournissent les repas).', d: 'Contrat.', src: ['dreetsPdl'] },
  { g: 'Indemnités', t: 'Frais de déplacement', n: 'Conventionnel (art. 113 CCN) + contrat', s: 'choix',
    r: 'Si l’assistante maternelle transporte l’enfant avec son véhicule à la demande des parents : indemnité kilométrique comprise entre le barème de l’administration et le barème fiscal, partagée entre employeurs selon les enfants transportés.',
    a: 'Tarif au km saisi dans la fiche (options avancées des tarifs) et kilomètres saisis sur les présences ; le montant du tarif n’est pas vérifié par l’application.', d: 'Contrat, puissance du véhicule, kilomètres.', src: ['sp'] },
  { g: 'Déclarations', t: 'Déclaration Pajemploi (faite par les parents)', n: 'Légal', s: 'info',
    r: 'Déclaration entre le 25 du mois et le 5 du mois suivant ; depuis le 25 janvier 2026, une déclaration par enfant. Salaire net total (dont retenues, heures en plus, congés payés) et indemnités déclarés séparément.',
    a: 'La carte « Paie estimée » donne des repères par enfant. Le nombre de « jours d’activité » est indicatif : son arrondi et le cas des mois avec absence sont à vérifier sur Pajemploi.', d: '—', src: ['urssafDecl', 'pajemploiSalaire', 'pajemploiJours'] },
  { g: 'Impôts', t: 'Régime fiscal spécifique (abattement)', n: 'Fiscal (art. 80 sexies CGI)', s: 'valider',
    r: 'Option : part imposable = rémunérations + indemnités d’entretien (et repas) − 3 × SMIC horaire par jour de garde et par enfant (4 × pour un enfant ouvrant droit à majoration de salaire), proratisé si la garde dure moins de 8 h. Déduction plafonnée aux sommes reçues. Autre option : déclarer le salaire seul.',
    a: 'Écran Récap › « Aide au calcul de l’abattement » : rien n’est calculé tant que les paramètres de l’année ne sont pas validés et que les sommes perçues (relevés Pajemploi) ne sont pas saisies.', d: 'Situation du foyer, enfant ouvrant droit à majoration, gardes de 24 h (non gérées).', src: ['impots'] },
  { g: 'Impôts', t: 'SMIC horaire à retenir pour l’abattement', n: 'Fiscal', s: 'valider',
    r: 'Revenus 2025 : 11,88 € toute l’année (impots.gouv.fr). Revenus 2026 : le SMIC a changé en cours d’année (12,02 € puis 12,31 € au 1er juin 2026). Par le passé, l’administration a retenu le SMIC par période ; la consigne pour 2026 sera publiée en 2027.',
    a: 'Valeurs proposées, modifiables par période, à valider par l’utilisatrice.', d: 'Publication d’impots.gouv.fr lors de la campagne de déclaration.', src: ['impots', 'smicJanv', 'smicJuin', 'bofip2007'] },
  { g: 'Impôts', t: 'Repas fournis par les parents', n: 'Fiscal', s: 'valider',
    r: 'Ils sont imposables et peuvent être évalués à 5,45 € par jour (revenus 2025).',
    a: 'Paramètre de l’année (valeur 2026 non publiée) et case par enfant.', d: 'Qui fournit les repas.', src: ['impots'] },
];

const STATUT = { auto: ['t-presence', '✓', 'Calcul automatique'], choix: ['t-prevu', '☐', 'Choix à faire (saisie ou contrat)'], valider: ['t-absence_enfant', '!', 'À valider avant calcul'], info: ['t-non_prevu', 'i', 'Affiché, non calculé'] };

function renderRules() {
  setTitle('Règles & sources', true);
  let h = `<h1>Règles & sources</h1>
    <p class="muted">Règles utilisées par l'application, leur nature et leurs sources officielles (consultées le ${CONSULTE}). Pour un point précis, la convention collective (IDCC 3239), le contrat de travail et Pajemploi font foi.</p>
    <div class="legend">${Object.values(STATUT).map(([c, i, l]) => `<span class="badge ${c}"><span class="ic">${i}</span>${l}</span>`).join('')}</div>`;
  let g = '';
  for (const x of RULES) {
    if (x.g !== g) { g = x.g; h += `<h2 class="section-title">${g}</h2>`; }
    const [c, i, l] = STATUT[x.s];
    h += `<details class="help"><summary>${esc(x.t)} <span class="badge ${c}" style="font-size:.72rem"><span class="ic">${i}</span>${l}</span></summary>
      <p><strong>Nature :</strong> ${esc(x.n)}</p>
      <p><strong>Règle :</strong> ${esc(x.r)}</p>
      <p><strong>Dans l'application :</strong> ${esc(x.a)}</p>
      ${x.d && x.d !== '—' ? `<p><strong>Dépend de :</strong> ${esc(x.d)}</p>` : ''}
      <p class="note"><strong>Sources :</strong></p><ul class="note">${x.src.map((k) => `<li><a href="${SOURCES[k].u}" target="_blank" rel="noopener">${esc(SOURCES[k].t)}</a></li>`).join('')}</ul></details>`;
  }
  h += `<p class="note">Ces informations sont un résumé et ne constituent pas un conseil juridique ou fiscal.</p>`;
  app.innerHTML = h;
}
