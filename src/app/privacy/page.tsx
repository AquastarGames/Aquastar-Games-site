import type { Metadata } from "next";
import { getLegalDoc } from "@/content/legal";
import { LegalPage } from "@/features/legal/LegalPage";

const doc = getLegalDoc("privacy")!;

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: `${doc.title} — Aquastar Games`,
    description: doc.description,
    url: "/privacy",
    type: "article",
  },
};

export default function PrivacyPolicyPage() {
  return <LegalPage doc={doc} />;
}