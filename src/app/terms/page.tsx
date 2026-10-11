import type { Metadata } from "next";
import { getLegalDoc } from "@/content/legal";
import { LegalPage } from "@/features/legal/LegalPage";

const doc = getLegalDoc("terms")!;

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: `${doc.title} — Aquastar Games`,
    description: doc.description,
    url: "/terms",
    type: "article",
  },
};

export default function TermsPage() {
  return <LegalPage doc={doc} />;
}