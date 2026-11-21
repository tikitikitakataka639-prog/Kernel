/**
 * Extracción conservadora de referencias temporales en español.
 * Las fechas relativas se conservan como texto: no se resuelven sin una fecha
 * de referencia fiable. Toda referencia requiere revisión humana.
 */
export type ExplicitTemporalReference = {
  value: string;
  excerpt: string;
  kind: "absolute" | "relative";
};

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

const PATTERNS: Array<{ regex: RegExp; kind: ExplicitTemporalReference["kind"] }> = [
  { regex: /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?\b/gi, kind: "absolute" },
  { regex: /\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/g, kind: "absolute" },
  { regex: /\b(?:el\s+)?\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?\d{4}\b/gi, kind: "absolute" },
  { regex: /\b(?:pasado mañana|esta mañana|esta tarde|esta noche|anteayer|ayer|hoy|(?<!la )mañana|anoche|la semana pasada|la semana que viene|la próxima semana|el mes pasado|el próximo mes|hace\s+\d+\s+(?:segundos?|minutos?|horas?|días?|semanas?|meses?|años?)|dentro de\s+\d+\s+(?:segundos?|minutos?|horas?|días?|semanas?|meses?|años?)|el\s+(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo)(?:\s+(?:pasado|próximo|que viene))?|(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo)\s+(?:pasado|próximo))\b/gi, kind: "relative" },
];

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function validAbsoluteDate(value: string): boolean {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return isValidDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numeric) return isValidDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));

  const named = value.toLocaleLowerCase("es").match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de\s+)?(\d{4})/i);
  if (named) {
    const day = named[1] ?? "";
    const monthName = named[2] ?? "";
    const year = named[3] ?? "";
    const month = MONTHS[monthName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
    if (month === undefined) return false;
    return isValidDate(Number(year), month, Number(day));
  }
  return false;
}

export function extractTemporalReferences(
  text: string,
  maxReferences = 50,
): ExplicitTemporalReference[] {
  const found: Array<ExplicitTemporalReference & { index: number }> = [];
  const seen = new Set<string>();

  let lineOffset = 0;
  for (const line of text.split(/\r?\n/)) {
    const excerpt = line.trim();
    if (!excerpt) continue;

    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      for (const match of excerpt.matchAll(pattern.regex)) {
        const value = match[0].trim();
        if (pattern.kind === "absolute" && !validAbsoluteDate(value)) continue;
        const key = pattern.kind + "\u0000" + value.toLocaleLowerCase("es") + "\u0000" + excerpt;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({
          value,
          excerpt: excerpt.slice(0, 500),
          kind: pattern.kind,
          index: lineOffset + (match.index ?? 0),
        });
      }
    }
    lineOffset += line.length + 1;
  }

  return found
    .sort((a, b) => a.index - b.index)
    .slice(0, Math.max(0, maxReferences))
    .map(({ index: _index, ...reference }) => reference);
}

/** Alias compatible con la versión anterior. */
export function extractExplicitTemporalReferences(
  text: string,
  maxReferences = 50,
): ExplicitTemporalReference[] {
  return extractTemporalReferences(text, maxReferences);
}
