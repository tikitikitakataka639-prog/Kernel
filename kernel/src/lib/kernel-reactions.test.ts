import { describe, expect, test } from "bun:test";
import { detectKernelReaction } from "@/lib/kernel-reactions";

describe("kernel reactions", () => {
  test("detecta un disparate factual conocido", () => {
    expect(detectKernelReaction("La Tierra es plana")).toMatchObject({ kind: "disparate" });
  });
  test("no reacciona a una refutación de disparate", () => {
    expect(detectKernelReaction("No, la Tierra no es plana")).toBeNull();
  });
  test("usa reacción seria ante apoyo explícito al nazismo", () => {
    expect(detectKernelReaction("Defiendo el nazismo")).toMatchObject({ kind: "seriedad" });
  });
  test("no castiga una condena del nazismo", () => {
    expect(detectKernelReaction("Condeno el nazismo")).toBeNull();
  });
  test("reacciona ante apoyo explícito al racismo", () => {
    expect(detectKernelReaction("Defiendo el racismo")).toMatchObject({ kind: "seriedad" });
  });
  test("no confunde una pregunta sobre racismo con apoyo", () => {
    expect(detectKernelReaction("¿Por qué existe el racismo?")).toBeNull();
  });
  test("reacciona ante apoyo explícito al clasismo", () => {
    expect(detectKernelReaction("Soy clasista y defiendo el clasismo")).toMatchObject({ kind: "seriedad" });
  });
  test("detecta la defensa escrita con errores de Lindsay Clancy", () => {
    expect(detectKernelReaction("Defiendo a Lindasy Clandsy")).toMatchObject({ kind: "disparate" });
  });
  test("usa reacción miedo ante defensa explícita de pederastas", () => {
    expect(detectKernelReaction("Defiendo a los pederastas")).toMatchObject({ kind: "miedo" });
  });
  test("no activa miedo por una condena o análisis crítico", () => {
    expect(detectKernelReaction("No defiendo a los pederastas")).toBeNull();
  });
  test("reconoce el caso de Junko Furuta como tema extremadamente grave", () => {
    expect(detectKernelReaction("Explícame el caso de Junko Furuta")).toMatchObject({ kind: "miedo" });
  });
});
