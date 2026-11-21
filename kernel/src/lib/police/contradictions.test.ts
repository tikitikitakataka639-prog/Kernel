import { describe, expect, test } from "bun:test";
import { detectPolarityContradictions } from "@/lib/police/contradictions";

describe("posibles contradicciones por polaridad", () => {
  test("detecta una afirmación y su negación literal", () => {
    const result = detectPolarityContradictions([
      { sourceId: "a", text: "El usuario estaba en Madrid el lunes a las diez." },
      { sourceId: "b", text: "El usuario no estaba en Madrid el lunes a las diez." },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.positive.sourceId).toBe("a");
    expect(result[0]?.negative.sourceId).toBe("b");
  });

  test("no infiere contradicciones por sinónimos ni frases distintas", () => {
    expect(detectPolarityContradictions([
      { sourceId: "a", text: "La persona llegó a Madrid durante la mañana." },
      { sourceId: "b", text: "La persona nunca estuvo en la capital durante la mañana." },
    ])).toEqual([]);
  });

  test("no marca dos afirmaciones o dos negaciones", () => {
    expect(detectPolarityContradictions([
      { sourceId: "a", text: "El usuario estaba en Madrid el lunes a las diez." },
      { sourceId: "b", text: "El usuario estaba en Madrid el lunes a las diez." },
      { sourceId: "c", text: "El usuario no estaba en Madrid el lunes a las diez." },
      { sourceId: "d", text: "El usuario nunca estaba en Madrid el lunes a las diez." },
    ])).toHaveLength(2);
  });
});
