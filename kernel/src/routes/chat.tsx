import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat normal — K.E.R.N.E.L." },
      {
        name: "description",
        content:
          "Habla con K.E.R.N.E.L.: conversaciones guardadas, memoria, capturas y consultas de normativa española.",
      },
      { property: "og:title", content: "Chat normal — K.E.R.N.E.L." },
      {
        property: "og:description",
        content: "Conversación directa con el KERNEL AI ENGINE, con librería de chats y memoria.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <Outlet />,
});
