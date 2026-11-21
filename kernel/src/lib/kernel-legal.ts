/**
 * Índice normativo curado (fuentes oficiales BOE).
 * KERNEL solo puede citar normas de esta lista: así nunca inventa leyes ni artículos.
 */
export type LegalEntry = {
  norma: string;
  articulo?: string;
  materia: string;
  url: string;
  claves: string[];
};

export const LEGAL_INDEX: LegalEntry[] = [
  {
    norma: "Ley Orgánica 10/1995, Código Penal",
    articulo: "Art. 183",
    materia: "Agresión sexual a menores de dieciséis años.",
    url: "https://www.boe.es/buscar/act.php?id=BOE-A-1995-25444",
    claves: ["menor", "sexual", "agresion", "g4", "pedofilia"],
  },
  {
    norma: "Ley Orgánica 10/1995, Código Penal",
    articulo: "Art. 183 bis",
    materia:
      "Embaucamiento de menores con fines sexuales a través de tecnologías de la información (child grooming).",
    url: "https://www.boe.es/buscar/act.php?id=BOE-A-1995-25444",
    claves: ["grooming", "contacto", "menor", "chat", "g3", "g4", "hablame"],
  },
  {
    norma: "Ley Orgánica 10/1995, Código Penal",
    articulo: "Art. 186",
    materia: "Difusión de material pornográfico entre menores de edad.",
    url: "https://www.boe.es/buscar/act.php?id=BOE-A-1995-25444",
    claves: ["pornografia", "difusion", "menor", "g2"],
  },
  {
    norma: "Ley Orgánica 10/1995, Código Penal",
    articulo: "Art. 189",
    materia:
      "Pornografía infantil: producción, difusión, facilitación de acceso y posesión de material de abuso sexual infantil.",
    url: "https://www.boe.es/buscar/act.php?id=BOE-A-1995-25444",
    claves: ["cp", "csam", "telegram", "link in bio", "grupo", "g1", "g2", "material"],
  },
  {
    norma: "Ley Orgánica 10/1995, Código Penal",
    articulo: "Art. 197",
    materia: "Descubrimiento y revelación de secretos; difusión no consentida de imágenes.",
    url: "https://www.boe.es/buscar/act.php?id=BOE-A-1995-25444",
    claves: ["imagenes", "privacidad", "difusion", "datos"],
  },
  {
    norma: "Ley Orgánica 10/1995, Código Penal",
    articulo: "Art. 173",
    materia: "Trato degradante e integridad moral.",
    url: "https://www.boe.es/buscar/act.php?id=BOE-A-1995-25444",
    claves: ["acoso", "degradante", "humillacion"],
  },
  {
    norma: "Ley Orgánica 8/2021 (LOPIVI)",
    materia:
      "Protección integral a la infancia y la adolescencia frente a la violencia; deber de comunicación de situaciones de riesgo.",
    url: "https://www.boe.es/buscar/act.php?id=BOE-A-2021-9347",
    claves: ["lopivi", "infancia", "proteccion", "deber", "denuncia"],
  },
  {
    norma: "Ley Orgánica 3/2018 (LOPDGDD)",
    materia: "Protección de datos personales y garantía de derechos digitales; datos de menores.",
    url: "https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673",
    claves: ["datos", "lopd", "privacidad", "menor"],
  },
  {
    norma: "Ley 34/2002 (LSSI)",
    materia: "Servicios de la sociedad de la información: deberes de retirada de contenido ilícito.",
    url: "https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758",
    claves: ["plataforma", "retirada", "contenido", "meta", "hosting"],
  },
];

export const REPORT_CHANNELS = [
  { label: "Policía Nacional — colabora/informar", url: "https://www.policia.es/_es/colabora_informar.php" },
  { label: "Grupo de Delitos Telemáticos (Guardia Civil)", url: "https://www.gdt.guardiacivil.es/webgdt/pinformar.php" },
  { label: "Denuncia interna de Threads/Meta", url: "https://help.instagram.com/192435014247952" },
];

export function searchLegalIndex(query: string): LegalEntry[] {
  const q = query.toLowerCase();
  const scored = LEGAL_INDEX.map((entry) => {
    const haystack = `${entry.norma} ${entry.articulo ?? ""} ${entry.materia} ${entry.claves.join(" ")}`.toLowerCase();
    const score = entry.claves.filter((k) => q.includes(k)).length + (haystack.includes(q) ? 1 : 0);
    return { entry, score };
  });
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return (hits.length > 0 ? hits : scored).slice(0, 6).map((s) => s.entry);
}
