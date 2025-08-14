// mapping.js

export function regimeToActivityType(txt = "") {
  const t = String(txt).normalize("NFKC").toLowerCase();
  if (t.includes("agirc") || t.includes("arrco")) return "private";  // complémentaires -> salarié privé
  if (t.includes("rci")) return "liberal";
  if (t.includes("msa")) return "msa";
  if (t.includes("cnav") || t.includes("salari") || t.includes("urssaf")) return "private";
  if (t.includes("fonction") || t.includes("civile") || t.includes("etat") || t.includes("territoriale")) return "public";
  return "private";
}

export function parseAmount(eur) {
  if (eur == null) return undefined;
  return Number(String(eur).replace(/[ € ]/g, "").replace(/\./g, "").replace(",", "."));
}

export function toFloat(fr) {
  return Number(String(fr).replace(/\s| /g, "").replace(/\./g, "").replace(",", "."));
}

/**
 * Agrège les lignes d’emploi par année => { [year]: { income, activityType } }
 * Attend des objets éventuellement comme:
 *   { startDate: "01/01/2020", endDate: "31/12/2020", income: "45 000", regime: "AGIRC-ARRCO" }
 */
export function employmentsToYearMap(employments = []) {
  const out = {};
  let lastRegime = '';

  for (const e of employments) {
    // essaie d’abord endDate, sinon un champ date quelconque
    const dateStr = e?.endDate || e?.date || e?.periode || "";
    // récupère l’année (4 chiffres en fin de date ou n’importe où)
    const yearMatch = String(dateStr).match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : NaN;
    if (isNaN(year)) continue;

    const income = parseAmount(e?.income) || 0;
    let regime = e?.regime || lastRegime || "";
    if (regime) lastRegime = regime;

    if (!out[year]) out[year] = { income: 0, activityType: regimeToActivityType(regime) };
    out[year].income += income;
  }
  return out;
}
