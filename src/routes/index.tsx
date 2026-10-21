import { createFileRoute } from "@tanstack/react-router";
import { JournalApp } from "@/components/journal/journal-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <JournalApp />;
}
