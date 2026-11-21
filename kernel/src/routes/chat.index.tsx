import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { createChat, loadChats } from "@/lib/kernel-chats";

export const Route = createFileRoute("/chat/")({
  head: () => ({ meta: [
    { title: "Biblioteca de conversaciones — K.E.R.N.E.L." },
    { name: "description", content: "Accede a tus conversaciones guardadas con K.E.R.N.E.L." },
    { property: "og:title", content: "Biblioteca de conversaciones — K.E.R.N.E.L." },
    { property: "og:description", content: "Historial de conversaciones de K.E.R.N.E.L." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ChatIndex,
});

function ChatIndex() {
  const navigate = useNavigate();

  useEffect(() => {
    const chats = loadChats();
    const target = chats[0] ?? createChat();
    void navigate({ to: "/chat/$threadId", params: { threadId: target.id }, replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-xs uppercase tracking-widest text-muted-foreground">
      abriendo chat normal...
    </div>
  );
}
