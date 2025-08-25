// parser.js — extraction texte PDF → objet RSI complet, avec points par régime par année

export async function parseRSI(fileOrUrl) {
  const txt = await loadPdfText(fileOrUrl);

  const out = {
    // entête "où en sont mes droits"
    requiredQuarters: findNumber(/(\d+)\s*trimestres\s+sont\s+requis/i, txt),
    acquiredQuarters: findNumber(/au\s+\d{2}\/\d{2}\/\d{4}\s+vous\s+en\s+avez\s+enregistré\s+(\d+)/i, txt)
                      ?? findNumber(/vous\s+en\s+avez\s+enregistré\s+(\d+)/i, txt),

    // lignes par année
    years: [],

    // éventuelle liste d’emplois (détail de carrière)
    employments: [],

    // agrégats Agirc‑Arrco (si mentionnés dans la synthèse)
    agircArrco: {}
  };

  // ---- 1) DÉTECTION ANNUELLE "Durée tous régimes" (YYYY X trim.)
  // Exemple : "2024 4 trim."
  const yearDurRe = /(?:^|\s)(20\d{2}|19\d{2})\s+(\d+)\s*trim\./gi;
  let m;
  const yearsIdx = {}; // année -> index dans out.years
  while ((m = yearDurRe.exec(txt)) !== null) {
    const year = +m[1];
    const quarters = +m[2];
    yearsIdx[year] = out.years.length;
    out.years.push({ year, quarters, pointsByScheme: {} });
  }

  // ---- 2) POINTS PAR RÉGIME DANS "Détail par année"
  //
  // La structure textuelle issue de pdf.js ressemble à :
  // 2024 4 trim.  Agirc-Arrco 70,9 pts  L’Assurance retraite 4 trim.
  //
  // On va découper le "bloc année" : de l’occurrence d’une année jusqu’à l’occurrence de la suivante (ou fin)
  // et dans ce bloc, chercher toutes les paires :  <LibelléRégime> <nombre> pts
  //
  // Régimes possibles à repérer (liste ouverte) :
  //  - Agirc-Arrco, Ircantec, RCI, Agirc TB, Agirc TC, AgircArrco (variante), CNRACL, RAFP, etc.
  //
  const yearList = Object.keys(yearsIdx)
    .map(v => +v)
    .sort((a, b) => a - b);

  for (let i = 0; i < yearList.length; i++) {
    const y = yearList[i];
    const startPos = indexOfYear(txt, y);
    const endPos = (i < yearList.length - 1) ? indexOfYear(txt, yearList[i + 1]) : txt.length;
    if (startPos === -1) continue;

    const slice = txt.slice(startPos, endPos);

    // repère toute forme "<libellé> <nombre> pts"
    // on capte le libellé jusqu’au nombre, en évitant de manger "trim."
    const ptsRe = /([A-Za-zÀ-ÖØ-öø-ÿ'’\-\s]+?)\s+([\d\s.,]+)\s*pts/gi;
    let pm;
    while ((pm = ptsRe.exec(slice)) !== null) {
      const rawLabel = sanitize(pm[1]);              // libellé régime tel qu'imprimé
      const pts = toFloat(pm[2]);                    // valeur numérique (virgule → point)
      const key = normalizeScheme(rawLabel);         // clé normalisée

      if (!key) continue;                            // si libellé non pertinent, on zappe

      const idx = yearsIdx[y];
      if (idx !== undefined) {
        const bucket = out.years[idx].pointsByScheme;
        bucket[key] = (bucket[key] ?? 0) + pts;      // somme si plusieurs occurrences dans l’année
      }
    }
  }

  // ---- 3) TOTAL + VALEUR DU POINT AGIRC‑ARRCO (Synthèse)
  const totalAgirc = /Total des points\s+([\d.,]+)\s*(?:\r?\n|\s)*Valeur du point/i.exec(txt);
  const pointVal = /Valeur du point.*?:\s*([\d,]+)\s*€/i.exec(txt);
  if (totalAgirc) out.agircArrco.totalPoints = toFloat(totalAgirc[1]);
  if (pointVal)   out.agircArrco.pointValue  = toFloat(pointVal[1]);

  // ---- 4) DÉTAIL EMPLOIS (tableau Employeur/activité)
  // Exemple structuré par lignes dans ton PDF :
  // "Employeur/activité  Date début  Date fin  Revenus*  Régime(s)"
  // Puis :
  // "TECHNAL  06/09/2021 31/12/2021 3 640 € L’Assurance retraite, Agirc-Arrco"
  //
  // Heuristique robuste (multi‑espaces + dates JJ/MM/AAAA) :
  const rowRe =
    /([^\n]*?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d\s.,]+)\s*€?\s+([^\n]+?)(?=\s+\d{2}\/\d{2}\/\d{4}|\s*Edité|$)/g;

  while ((m = rowRe.exec(txt)) !== null) {
    const employer = sanitize(m[1]);
    const startDate = m[2];
    const endDate = m[3];
    const income = m[4];
    const regime = sanitize(m[5]);
    // on filtre les lignes d’en‑tête ou vides évidentes
    if (!/\d{2}\/\d{2}\/\d{4}/.test(startDate)) continue;
    out.employments.push({
      employer,
      startDate,
      endDate,
      income,
      regime,
    });
  }

  return out;
}

/* ========================== UTILS ========================== */

async function loadPdfText(fileOrUrl) {
  // Compatible GitHub Pages / CDN : pdfjsLib est chargé globalement dans index.html
  const loading = typeof fileOrUrl === 'string'
    ? pdfjsLib.getDocument(fileOrUrl)
    : pdfjsLib.getDocument({ data: await fileToArrayBuffer(fileOrUrl) });

  const pdf = await loading.promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += ' ' + content.items.map(it => it.str).join(' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}

function fileToArrayBuffer(file) { return new Response(file).arrayBuffer(); }

function toFloat(fr) {
  // enlève espaces fines, points milliers, remplace virgule par point
  return Number(String(fr).replace(/[ \u00A0\u202F]/g,'').replace(/\./g,'').replace(',', '.'));
}

function findNumber(regex, text) {
  const m = regex.exec(text);
  return m ? +m[1] : undefined;
}

// Retourne l’index de la 1re occurrence de l’année YYYY dans le texte concaténé
function indexOfYear(txt, year) {
  // on tolère les variantes d’espaces
  const re = new RegExp(`(?:^|\\s)${year}\\s+\\d+\\s*trim\\.`, 'i');
  const m = re.exec(txt);
  return m ? m.index : -1;
}

function sanitize(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

// Normalise le libellé régime en clé JS pour pointsByScheme
function normalizeScheme(label) {
  const t = label.normalize('NFKC').toLowerCase();

  // les plus fréquents dans les relevés
  if (/agirc[\s-]*arrco/.test(t)) return 'agircArrco';
  if (/ircantec/.test(t))        return 'ircantec';
  if (/\brci\b/.test(t))         return 'rci';
  if (/agirc\s*tb/.test(t))      return 'agircTB';
  if (/agirc\s*tc/.test(t))      return 'agircTC';
  if (/cnracl/.test(t))          return 'cnracl';
  if (/\brpf\b/.test(t))         return 'rpf';
  if (/\brafp\b/.test(t))        return 'rafp';

  // "Assurance retraite" c’est la base en trimestres → pas un régime à points
  if (/assurance\s+retraite/.test(t)) return null;

  // si c’est manifestement "Points ..." générique mais non mappé, on renvoie un libellé compact
  if (/points?/.test(t)) return slugify(label);

  // par défaut, on tente un compactage sûr
  return slugify(label);
}

function slugify(s) {
  return s.normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24) || null;
}
