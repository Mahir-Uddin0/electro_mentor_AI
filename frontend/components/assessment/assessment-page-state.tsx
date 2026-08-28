import { AlertCircle, ClipboardList } from "lucide-react";

import { Button, Card, LinkButton } from "@/components/ui";

export function AssessmentLoading({ label = "Loading your assessment…" }) {
  return (
    <div className="full-loader assessment-loader">
      <span className="spinner" /> {label}
    </div>
  );
}

export function AssessmentLoadError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <Card className="assessment-state-card">
      <span className="icon-box icon-amber"><AlertCircle size={20} /></span>
      <div>
        <h1>Couldn&apos;t load your assessment</h1>
        <p>{message}</p>
      </div>
      <Button variant="secondary" onClick={retry}>Try Again</Button>
    </Card>
  );
}

export function AssessmentMissing({
  description = "Start the practical assessment before opening this step.",
}: {
  description?: string;
}) {
  return (
    <Card className="assessment-state-card">
      <span className="icon-box icon-blue"><ClipboardList size={20} /></span>
      <div>
        <h1>No assessment started</h1>
        <p>{description}</p>
      </div>
      <LinkButton href="/assessments/new/upload">Start Assessment</LinkButton>
    </Card>
  );
}
