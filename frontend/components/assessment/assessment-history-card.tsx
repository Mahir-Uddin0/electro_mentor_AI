"use client";

import { CalendarDays, FileVideo, Trophy } from "lucide-react";

import { assessmentResultHref } from "@/components/assessment/assessment-links";
import { useLanguage } from "@/components/language-provider";
import { Badge, Card, LinkButton } from "@/components/ui";
import type { PracticalAssessmentHistoryItem } from "@/lib/api/client";

function scoreTone(score: number): "green" | "amber" | "red" {
  if (score >= 80) return "green";
  if (score >= 60) return "amber";
  return "red";
}

function assessmentTitle(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return withoutExtension.replaceAll(/[_-]+/g, " ").trim() || "Practical work assessment";
}

function completedDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function AssessmentHistoryCard({
  assessment,
}: {
  assessment: PracticalAssessmentHistoryItem;
}) {
  const { locale, t } = useLanguage();
  const tone = scoreTone(assessment.overall_score);

  return (
    <Card className="assessment-history-card">
      <div className="assessment-history-card-head">
        <span className="icon-box icon-blue"><FileVideo size={18} /></span>
        <div className="chips">
          <Badge tone={tone}>{new Intl.NumberFormat(locale).format(assessment.overall_score)}%</Badge>
          <Badge tone={assessment.passed ? "green" : "amber"}>
            {assessment.passed ? t("Passed") : t("Needs improvement")}
          </Badge>
        </div>
      </div>
      <div className="assessment-history-card-copy">
        <h3>{assessmentTitle(assessment.video_file_name)}</h3>
        <p title={assessment.video_file_name}>{assessment.video_file_name}</p>
      </div>
      <div className="assessment-history-meta">
        <span><CalendarDays size={13} /> {completedDate(assessment.completed_at, locale)}</span>
        <span><Trophy size={13} /> {t("Grade {{grade}}", { grade: assessment.grade })}</span>
      </div>
      <LinkButton href={assessmentResultHref("results", assessment.id)}>
        {t("View Results")}
      </LinkButton>
    </Card>
  );
}
