const DETECTORS = [
  { name: "Horizon", purpose: "Phishing y fraude" },
  { name: "MrBERT Legal", purpose: "Encoder de análisis jurídico" },
  { name: "Grooming ES/EN", purpose: "Detector contextual experimental" },
  { name: "PaxmodGuard", purpose: "Señales de seguridad de menores" },
] as const;

export function PoliceModelManager() {
  return (
    <section className="space-y-2 border-t border-border pt-3" aria-label="Componentes especializados de Police Mode">
      <h3 className="text-[10px] uppercase tracking-widest text-primary">COMPONENTES ESPECIALIZADOS</h3>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Estos cuatro detectores no se descargan desde esta publicación porque todavía no hay un servicio Police Engine público conectado.
        Se desactivan sus botones de descarga para evitar peticiones fallidas; no afecta al modelo Llama 3B de Police Mode ni al Chat General Qwen.
      </p>
      <ul className="space-y-1">
        {DETECTORS.map((detector) => (
          <li key={detector.name} className="flex flex-wrap items-center justify-between gap-2 border border-border px-2 py-2 text-[10px]">
            <span className="text-foreground">{detector.name} <span className="text-muted-foreground">· {detector.purpose}</span></span>
            <span className="text-muted-foreground">PENDIENTE DE SERVICIO</span>
          </li>
        ))}
      </ul>
      <p className="text-[9px] leading-relaxed text-muted-foreground">No se muestran como operativos ni se descargan en segundo plano. Su activación requerirá desplegar y verificar el backend Police Engine.</p>
    </section>
  );
}
