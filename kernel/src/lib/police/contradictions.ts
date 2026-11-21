/**
 * Detección determinista y de alta precisión de posibles contradicciones.
 * Solo compara frases cuyo contenido normalizado es idéntico y cuya polaridad
 * cambia por un marcador explícito de negación. No interpreta sinónimos.
 */
export type ContradictionStatement = {
  text: string;
  sourceId: string;
};

export type ContradictionCandidate = {
  positive: ContradictionStatement;
  negative: ContradictionStatement;
};

const NEGATION = /\b(no|nunca|jam[aá]s)\b/iu;

function normalizeStatement(text: string): { key: string; negative: boolean } | null {
  const normalized = text
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:()[\]{}"'“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized.length < 18) return null;

  const negative = NEGATION.test(normalized);
  const key = normalized.replace(NEGATION, " ").replace(/\s+/g, " ").trim();
  const tokens = key.split(" ").filter(Boolean);
  if (tokens.length < 4 || key.length < 14) return null;
  return { key, negative };
}

export function detectPolarityContradictions(
  statements: ContradictionStatement[],
  maxCandidates = 20,
): ContradictionCandidate[] {
  const candidates: ContradictionCandidate[] = [];
  const seen = new Set<string>();

  const parsed = statements.flatMap((statement) => {
    const fragments = statement.text
      .split(/(?<=[.!?])\s+|\r?\n+|;\s*/u)
      .map((text) => text.trim())
      .filter(Boolean)
      .slice(0, 100);
    return fragments.map((text) => {
      const normalized = normalizeStatement(text);
      return normalized ? { statement: { ...statement, text }, ...normalized } : null;
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  });

  for (let i = 0; i < parsed.length; i += 1) {
    for (let j = i + 1; j < parsed.length; j += 1) {
      const a = parsed[i];
      const b = parsed[j];
      if (!a || !b) continue;
      if (a.key !== b.key || a.negative === b.negative) continue;
      if (a.statement.text === b.statement.text) continue;
      const pair = [a.statement.text, b.statement.text].sort().join("\u0000");
      if (seen.has(pair)) continue;
      seen.add(pair);
      candidates.push({
        positive: a.negative ? b.statement : a.statement,
        negative: a.negative ? a.statement : b.statement,
      });
      if (candidates.length >= maxCandidates) return candidates;
    }
  }
  return candidates;
}
