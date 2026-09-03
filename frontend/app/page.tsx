import type { Metadata } from "next";

import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "ElectroMentor AI | Practical electrical learning",
  description:
    "Learn electrical work with AI-assisted troubleshooting, practical assessment, photo review, safety checklists, and trusted guides.",
};

export default function Home() {
  return <LandingPage />;
}
