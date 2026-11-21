export function downloadComplaintDraft(originalRequest: string, assistantDraft: string): void {
  const now = new Date();
  const stamp = now.toISOString();
  const body = [
    "BORRADOR DE DENUNCIA — K.E.R.N.E.L.",
    `Generado: ${stamp}`,
    "",
    "PETICIÓN ORIGINAL DEL USUARIO",
    originalRequest.trim(),
    "",
    "BORRADOR REDACTADO POR KERNEL",
    assistantDraft.trim(),
    "",
    "AVISO: Borrador no presentado ni enviado. Revise todos los datos, elimine los marcadores [DATO NO APORTADO] y compruebe el canal competente antes de utilizarlo. Las inferencias no son hechos probados.",
  ].join("\n");
  const blob = new Blob(["\uFEFF", body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `KERNEL-denuncia-borrador-${now.toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
