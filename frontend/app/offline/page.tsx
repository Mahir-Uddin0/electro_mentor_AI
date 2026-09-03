import type { Metadata } from "next";
import { ShieldAlert, WifiOff } from "lucide-react";

import { Brand } from "@/components/brand";
import { OfflineRetryButton } from "@/components/pwa/offline-retry-button";

export const metadata: Metadata = {
  title: "Offline | ElectroMentor AI",
  description: "ElectroMentor AI offline connection notice.",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <section className="offline-panel" aria-labelledby="offline-title">
        <Brand />
        <span className="offline-page-icon" aria-hidden="true">
          <WifiOff size={30} />
        </span>
        <h1 id="offline-title">You’re offline</h1>
        <p>
          Check your internet connection, then retry. AI Troubleshooting and
          Photo Analysis require a live connection and are unavailable offline.
        </p>
        <div className="offline-safety-note">
          <ShieldAlert size={18} aria-hidden="true" />
          <span>
            Do not treat previously viewed AI or safety information as a current
            inspection or live recommendation.
          </span>
        </div>
        <OfflineRetryButton />
      </section>
    </main>
  );
}
