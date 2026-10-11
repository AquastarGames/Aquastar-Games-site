import type { Metadata } from "next";
import { getLegalDoc } from "@/content/legal";
import { LegalPage } from "@/features/legal/LegalPage";

const doc = getLegalDoc("privacy-notice")!;

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: { canonical: "/privacy-notice" },
  openGraph: {
    title: `${doc.title} — Aquastar Games`,
    description: doc.description,
    url: "/privacy-notice",
    type: "article",
  },
};

export default function PrivacyNoticePage() {
  return <LegalPage doc={doc} />;
}