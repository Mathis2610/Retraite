// parser.js (module ES) – extraction texte PDF → objet RSI basique
export async function parseRSI(fileOrUrl) {
  const txt = await loadPdfText(fileOrUrl);
  const out = {
    requiredQuarters: findNumber(/(\d+)\s*trimestres\s+sont\s+requis/i, txt),
    acquiredQuarters: findNumber(/vous en avez (?:actuellement\s+)?enregistré\s+(\d+)/i, txt),
    years: [],
    employments: [],
    agircArrco: {}
  };

  // Année + trimestres (ex: "2024 4 trim.")
  let m; const yearRe = /(?:^|\s)(20\d{2}|19\d{2})\s+(\d+)\s*trim\./gi;
  while ((m = yearRe.exec(txt)) !== null) out.years.push({ year: +m[1], quarters: +m[2] });

  // Points AGIRC‑ARRCO par année (si visibles)
  const perYearPts = /(\d{4}).{0,40}?Agirc-Arrco\s+([\d,\.]+)\s*pts/gi;
  while ((m = perYearPts.exec(txt)) !== null) {
    const y = +m[1]; const pts = toFloat(m[2]);
    const row = out.years.find(r => r.year === y); if (row) row.agircArrcoPoints = pts;
  }

  // Total points + valeur du point
  const totalPts = /Total des points\s+([\d,\.]+)/i.exec(txt);
  const valuePt  = /Valeur du point .*?:\s*([\d,]+)\s*€/i.exec(txt);
  if (totalPts) out.agircArrco.totalPoints = toFloat(totalPts[1]);
  if (valuePt)  out.agircArrco.pointValue  = toFloat(valuePt[1]);

  return out;
}

async function loadPdfText(fileOrUrl) {
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
function toFloat(fr) { return Number(String(fr).replace(/\s| /g,'').replace(/\./g,'').replace(',','.')); }
function findNumber(regex, text){ const m = regex.exec(text); return m ? +m[1] : undefined; }
