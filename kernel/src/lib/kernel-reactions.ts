export type KernelReactionKind = "disparate" | "seriedad" | "miedo";
export type KernelReaction = {
  kind: KernelReactionKind;
  src: string;
  alt: string;
  caption: string;
};

const DISPARATE_IMAGES = [
  "/reacciones-kernel/que-coño-dices-1.gif",
  "/reacciones-kernel/que-coño-dices-2.jpg",
  "/reacciones-kernel/que-coño-dices-3.jpg",
  "/reacciones-kernel/que-coño-dices-4.jfif",
  "/reacciones-kernel/que-coño-dices-5.png",
];

function normalize(value: string): string {
  return value.toLocaleLowerCase("es-ES").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function negatedOrReporting(text: string): boolean {
  return /\b(no apoyo|no defiendo|no justifico|estoy en contra|rechazo|condeno|denuncio|critico|es inaceptable|esta mal|qué opinas de|que opinas de|por que es malo|por que esta mal)\b/.test(text);
}

function stableIndex(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % DISPARATE_IMAGES.length;
}

/**
 * Detector deliberadamente conservador. No clasifica ideología, religión,
 * nacionalidad o política por sí mismas: solo apoyo explícito a daño/odio,
 * defensa explícita de explotación infantil o disparates factuales conocidos.
 * No es moderación ni evaluación psicológica.
 */
export function detectKernelReaction(raw: string): KernelReaction | null {
  const text = normalize(raw).replace(/\s+/g, " ").trim();
  if (!text) return null;
  const context = negatedOrReporting(text);

  const severeCase = /\b(junko furuta|caso de junko|asesinato de junko)\b/.test(text);
  const explicitChildAbuseSupport =
    /\b(defiendo|apoyo|justifico|esta bien|esta permitido|no tiene nada de malo|no deberia ser delito|no son malos)\b.{0,90}\b(pedofilia|pedofilos|pederastas|abuso sexual infantil|explotacion sexual infantil)\b/.test(text) ||
    /\b(pedofilia|pedofilos|pederastas|abuso sexual infantil|explotacion sexual infantil)\b.{0,90}\b(defiendo|apoyo|justifico|esta bien|no tiene nada de malo|no deberia ser delito)\b/.test(text);
  if (severeCase || (explicitChildAbuseSupport && !context)) {
    return {
      kind: "miedo",
      src: "/reacciones-kernel/miedo.gif",
      alt: "Reacción de alarma ante un asunto extremadamente grave",
      caption: severeCase
        ? "Eso es un caso brutal. Lo tratamos con seriedad y sin recrearnos en el daño."
        : "No voy a normalizar ni justificar la explotación de menores. Vamos a ceñirnos a hechos y protección de víctimas.",
    };
  }

  const explicitHateAdvocacy =
    /\b(soy nazi|viva el nazismo|defiendo el nazismo|apoyo el nazismo|el nazismo es bueno|defiendo el fascismo|viva el fascismo|apoyo la supremacia racial|la supremacia racial es buena|el racismo esta bien|defiendo el racismo|apoyo el racismo|soy racista|la xenofobia esta bien|defiendo la xenofobia|apoyo la xenofobia|soy xenofobo|soy xenofoba|defiendo el clasismo|apoyo el clasismo|soy clasista|la clasificacion por clase es correcta)\b/.test(text) ||
    /\b(los|las) (negros|blancos|judios|musulmanes|inmigrantes|gitanos|mujeres|hombres|homosexuales|trans|pobres|ricos)\b.{0,70}\b(inferiores|son animales|no deberian existir|deberian desaparecer|merecen ser expulsados|merecen morir)\b/.test(text);
  if (explicitHateAdvocacy && !context) {
    return {
      kind: "seriedad",
      src: "/reacciones-kernel/seriedad.jpg",
      alt: "Reacción seria ante una afirmación discriminatoria o extremista",
      caption: "Eso cruza una línea: no voy a blanquear la deshumanización ni la defensa del odio. Si quieres discutirlo, aporta argumentos sin atacar la dignidad de grupos enteros.",
    };
  }

  const clearNonsense =
    /\b(la )?tierra es plana\b/.test(text) ||
    /\b(la )?tierra es el centro del universo\b/.test(text) ||
    /\b(la )?gravedad no existe\b/.test(text) ||
    /\b(la )?luna no existe\b/.test(text) ||
    /\b(las )?vacunas causan autismo\b/.test(text) ||
    /\b(defiendo|justifico|apoyo) a lind(?:say|asy) clan(?:cy|dsy)\b/.test(text) ||
    /\bel agua no moja\b/.test(text);
  if (clearNonsense && !context) {
    const src = DISPARATE_IMAGES[stableIndex(text)]!;
    return {
      kind: "disparate",
      src,
      alt: "Reacción humorística de KERNEL ante un disparate o afirmación sin fundamento",
      caption: "Bro, esa afirmación necesita pruebas. No voy a darla por cierta solo porque se haya dicho con seguridad.",
    };
  }
  return null;
}
