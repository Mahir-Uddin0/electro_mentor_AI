import type { ReactNode } from "react";

import { PracticalAssessmentProvider } from "@/components/assessment/assessment-provider";

export default function NewAssessmentLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PracticalAssessmentProvider>{children}</PracticalAssessmentProvider>
  );
}
