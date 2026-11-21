import { Link } from "@tanstack/react-router";
import { ArrowLeft, Settings } from "lucide-react";
import type { ReactNode } from "react";

import kernelLogo from "@/assets/kernel-logo-neon.png";

const NAV = [
  { to: "/chat", label: "chat" },
  { to: "/analisis", label: "análisis" },
  { to: "/ajustes", label: "ajustes" },
] as const;

export function KernelShell({
  title,
  subtitle,
  status,
  children,
}: {
  title: string;
  subtitle: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="kernel-scanlines flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-3 min-w-0" aria-label="Volver al inicio">
            <ArrowLeft className="size-4 text-muted-foreground" />
            <img src={kernelLogo} alt="" className="h-8 w-auto" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold tracking-[0.25em] text-primary kernel-glow">
              {title}
            </h1>
            <p className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
              {subtitle}
            </p>
          </div>
          <nav className="ml-auto hidden items-center gap-4 text-[10px] uppercase tracking-widest text-muted-foreground sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="transition-colors hover:text-primary [&.active]:text-primary"
              >
                {item.to === "/ajustes" ? <Settings className="mr-1 inline size-3 align-[-2px]" aria-hidden="true" /> : null}
                {item.label}
              </Link>
            ))}
          </nav>
          {status ? <div className="ml-3">{status}</div> : null}
        </div>
      </header>
      <main className={`mx-auto flex w-full ${title === "ANÁLISIS DE REDES SOCIALES" ? "max-w-7xl" : "max-w-5xl"} flex-1 flex-col px-4 py-6`}>{children}</main>
      <footer className="border-t border-border px-4 py-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
        KERNEL AI ENGINE · análisis indiciario · sin interacción con las cuentas analizadas
      </footer>
    </div>
  );
}
