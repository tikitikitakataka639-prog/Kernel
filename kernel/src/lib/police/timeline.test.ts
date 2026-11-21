import { describe, expect, test } from "bun:test";
import { extractTemporalReferences } from "@/lib/police/timeline";

describe("referencias temporales", () => {
  test("extrae fechas ISO, numéricas y meses escritos en español", () => {
    const result = extractTemporalReferences(
      "2026-11-20T10:30:00Z: mensaje\nFecha: 19/11/2026\nEl 20 de noviembre de 2026 hubo una llamada.",
    );
    expect(result.map((item) => item.value)).toEqual([
      "2026-11-20T10:30:00Z",
      "19/11/2026",
      "El 20 de noviembre de 2026",
    ]);
    expect(result.every((item) => item.kind === "absolute")).toBe(true);
  });

  test("descarta fechas de calendario imposibles", () => {
    expect(extractTemporalReferences("31/02/2026 y 2026-13-01")).toEqual([]);
  });

  test("conserva expresiones relativas sin inventar una fecha absoluta", () => {
    const result = extractTemporalReferences(
      "Ayer por la tarde ocurrió algo.\nEl martes pasado llegó un mensaje.\nHace 3 días se envió el correo.",
    );
    expect(result.map((item) => item.value)).toEqual([
      "Ayer", "El martes pasado", "Hace 3 días",
    ]);
    expect(result.every((item) => item.kind === "relative")).toBe(true);
  });

  test("no confunde la franja horaria por la mañana con el día siguiente", () => {
    const result = extractTemporalReferences("Mañana a las ocho llamaré.\nPor la mañana se envió el correo.\nEsta mañana llegó otro mensaje.");
    expect(result.map((item) => item.value)).toEqual(["Mañana", "Esta mañana"]);
  });

  test("no convierte expresiones vagas en fechas", () => {
    expect(extractTemporalReferences("pronto, quizá, en algún momento")).toEqual([]);
  });

  test("limita la cantidad de referencias", () => {
    expect(extractTemporalReferences("ayer\nhoy\nmañana", 2)).toHaveLength(2);
  });
});
