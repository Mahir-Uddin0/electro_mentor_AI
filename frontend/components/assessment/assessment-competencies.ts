export const practicalAssessmentCompetencies = [
  { key: "safety_procedures", label: "Safety Procedures" },
  { key: "tool_usage", label: "Tool Usage" },
  { key: "technical_knowledge", label: "Technical Knowledge" },
  { key: "work_quality", label: "Work Quality" },
  { key: "testing_verification", label: "Testing & Verification" },
  { key: "documentation", label: "Documentation" },
] as const;

export const practicalAssessmentCompetencyLabels = new Map<string, string>(
  practicalAssessmentCompetencies.map(({ key, label }) => [key, label]),
);
