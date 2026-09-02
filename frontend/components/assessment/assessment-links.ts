export type AssessmentResultSection = "results" | "skills" | "suggestions";

export function assessmentResultHref(
  section: AssessmentResultSection,
  assessmentId?: string | null,
) {
  const path = `/assessments/new/${section}`;
  return assessmentId
    ? `${path}?assessmentId=${encodeURIComponent(assessmentId)}`
    : path;
}
