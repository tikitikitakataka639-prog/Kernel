import { createFileRoute, redirect } from "@tanstack/react-router";

// El laboratorio antiguo de modelos de prueba se ha retirado de la web pública.
// Conservamos la ruta para que enlaces guardados lleguen a los Ajustes actuales.
export const Route = createFileRoute("/laboratorio-nativo")({
  beforeLoad: () => {
    throw redirect({ to: "/ajustes" });
  },
});
