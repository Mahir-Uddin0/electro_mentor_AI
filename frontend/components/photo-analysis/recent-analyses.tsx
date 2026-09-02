"use client";

import Link from "next/link";
import { Camera, ChevronRight, Eye } from "lucide-react";

import { Badge, Card, SectionTitle } from "@/components/ui";
import { useLanguage } from "@/components/language-provider";
import type {
  PhotoAnalysisResult,
  PhotoFaultSeverity,
} from "@/lib/api/client";

function severityTone(
  severity: PhotoFaultSeverity,
): "red" | "amber" | "blue" {
  if (severity === "critical" || severity === "high") return "red";
  if (severity === "medium") return "amber";
  return "blue";
}

function analysisTitle(analysis: PhotoAnalysisResult) {
  if (analysis.primary_fault) return analysis.primary_fault.title;
  if (analysis.outcome === "no_visible_faults") return "No visible fault";
  return "Image needs improvement";
}

function resultBadge(analysis: PhotoAnalysisResult) {
  if (analysis.primary_fault) {
    return {
      label: analysis.primary_fault.severity,
      tone: severityTone(analysis.primary_fault.severity),
    } as const;
  }
  if (analysis.outcome === "no_visible_faults") {
    return { label: "No visible fault", tone: "green" } as const;
  }
  return { label: "New photo needed", tone: "gray" } as const;
}

function formatDate(value: string, locale: string, recently: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? recently
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

export function RecentPhotoAnalyses({
  analyses,
}: {
  analyses: PhotoAnalysisResult[];
}) {
  const { locale, t } = useLanguage();
  return (
    <>
      <SectionTitle title={t("Analyses This Session")} />
      {analyses.length === 0 ? (
        <Card className="generator-card" style={{ color: "var(--muted)", fontSize: 12 }}>
          {t("Completed photo analyses from this browser session will appear here.")}
        </Card>
      ) : (
        <div className="history-grid">
          {analyses.map((analysis) => {
            const badge = resultBadge(analysis);
            return (
              <Link
                key={analysis.analysis_id}
                href={`/photo-analysis/results/${analysis.analysis_id}`}
              >
                <Card className="history-card">
                  <div className="history-thumb" style={{ position: "relative" }}>
                    <Camera size={22} />
                    <span style={{ position: "absolute", top: 9, right: 9 }}>
                      <Badge tone={badge.tone}>{t(badge.label)}</Badge>
                    </span>
                  </div>
                  <h3>{analysis.primary_fault ? analysisTitle(analysis) : t(analysisTitle(analysis))}</h3>
                  <p>{formatDate(analysis.analyzed_at, locale, t("Recently"))}</p>
                  <div className="history-meta">
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        color: "var(--muted)",
                        fontSize: 10,
                      }}
                    >
                      <Eye size={12} /> {t("View")} <ChevronRight size={12} />
                    </span>
                    {analysis.primary_fault && (
                      <Badge tone="green">
                        {t("{{score}}% confidence", { score: new Intl.NumberFormat(locale).format(Math.round(analysis.primary_fault.confidence)) })}
                      </Badge>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
