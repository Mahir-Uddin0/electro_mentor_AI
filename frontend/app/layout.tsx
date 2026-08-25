import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthProvider } from "@/components/auth/auth-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "ElectroMentor AI",
  description: "AI-powered electrical skills learning platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
