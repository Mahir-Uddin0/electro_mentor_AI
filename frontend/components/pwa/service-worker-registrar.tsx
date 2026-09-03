"use client";

import { useEffect } from "react";

export interface PwaInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    electroMentorInstallPrompt?: PwaInstallPromptEvent;
  }
}

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      window.electroMentorInstallPrompt = event as PwaInstallPromptEvent;
      window.dispatchEvent(new Event("electromentor-install-ready"));
    };
    const clearInstallPrompt = () => {
      window.electroMentorInstallPrompt = undefined;
    };

    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", clearInstallPrompt);

    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return () => {
        window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
        window.removeEventListener("appinstalled", clearInstallPrompt);
      };
    }

    const register = () => {
      void navigator.serviceWorker
        .register("/service-worker.js", {
          scope: "/",
          updateViaCache: "none",
        })
        .catch((error: unknown) => {
          console.error("ElectroMentor service worker registration failed", error);
        });
    };

    if (document.readyState === "complete") {
      register();
      return () => {
        window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
        window.removeEventListener("appinstalled", clearInstallPrompt);
      };
    }

    window.addEventListener("load", register, { once: true });
    return () => {
      window.removeEventListener("load", register);
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", clearInstallPrompt);
    };
  }, []);

  return null;
}
