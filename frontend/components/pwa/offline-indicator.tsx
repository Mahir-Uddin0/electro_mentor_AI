"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";

export function OfflineIndicator() {
  const { t } = useLanguage();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);
    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  if (online) return null;

  return (
    <div className="offline-status-banner" role="status" aria-live="polite">
      <WifiOff size={16} aria-hidden="true" />
      <span>
        {t(
          "You’re offline. Online features such as AI chat and photo review are unavailable.",
        )}
      </span>
    </div>
  );
}
