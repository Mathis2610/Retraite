// parser.js — PDF → text → structured RSI data

// --- Make sure pdf.js is present before using it
async function ensurePdfjs() {
  if (window.pdfjsLib) return;

  // Load the ESM build of pdf.js
  const mod = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.mjs');
  window.pdfjsLib = mod;

  // Point the worker to the CDN module worker
  mod.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.mjs';
}

export async function parseRSI(fileOrUrl) {
  // guarantee pdf.js is ready
  await ensurePdfjs();

  const txt = await loadPdfText(fileOrUrl);
  const out = {
    requiredQuarters: findNumber(/(\d+)\s*trimestres\s+sont\s+requis/i, txt),
    acquiredQuarters: findNumber(/vous en avez (?:actuellement\s+)?enregistré\s+(\d+)/i, txt),
    years: [],
    employments: [],
    agircArrco: {}
  };

  // yyyy + "trim." (e.g. "2024 4 trim.")
  let m; const yearRe = /(?:^|\s)(20\d{2}|19\d{2})\s+(\d+)\s*trim\./gi;
  while ((m = yearRe.exec(txt)) !== null) out.years.push({ year: +m[1], quarters: +m[2] });

  // Per-year Agirc-Arrco points (if shown)
  const perYearPts = /(\d{4}).{0,40}?Agirc-Arrco\s+([\d,\.]+)\s*pts/gi;
  while ((m = perYearPts.exec(txt)) !== null) {
    const y = +m[1]; const pts = toFloat(m[2]);
    const row = out.years.find(r => r.year === y); if (row) row.agircArrcoPoints = pts;
  }

  // Total points + point value
  const totalPts = /Total des points\s+([\d,\.]+)/i.exec(txt);
  const valuePt  = /Valeur du point .*?:\s*([\d,]+)\s*€/i.exec(txt);
  if (totalPts) out.agircArrco.totalPoints = toFloat(totalPts[1]);
  if (valuePt)  out.agircArrco.pointValue  = toFloat(valuePt[1]);

  return out;
}

async function loadPdfText(fileOrUrl) {
  await ensurePdfjs(); // safety net if called directly

  const loading = typeof fileOrUrl === 'string'
    ? window.pdfjsLib.getDocument(fileOrUrl)
    : window.pdfjsLib.getDocument({ data: await fileToArrayBuffer(fileOrUrl) });

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
