"use client";

import { FileVideo, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AssessmentHistoryCard } from "@/components/assessment/assessment-history-card";
import { useLanguage } from "@/components/language-provider";
import { Button, Card, EmptyState, LinkButton, PageHeading } from "@/components/ui";
import {
  frontendApi,
  type PracticalAssessmentHistoryItem,
} from "@/lib/api/client";

const PAGE_SIZE = 12;

export default function PracticalAssessmentHistoryPage() {
  const { t } = useLanguage();
  const [assessments, setAssessments] = useState<PracticalAssessmentHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    setError("");
    try {
      const response = await frontendApi.listPracticalAssessmentHistory({
        limit: PAGE_SIZE,
        offset,
      });
      setAssessments((current) =>
        offset === 0 ? response.assessments : [...current, ...response.assessments],
      );
      setTotal(response.total);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your practical-assessment history could not be loaded.",
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <div>
      <PageHeading
        eyebrow={t("Practical work")}
        title={t("Assessment History")}
        description={t("Review your completed work-video assessments and start another whenever you are ready.")}
        action={<LinkButton href="/assessments/new/upload" icon={Plus}>{t("New Assessment")}</LinkButton>}
      />

      {error && (
        <div className="auth-message error assessment-form-message">
          <span>{error}</span>
          <Button variant="ghost" onClick={() => void loadHistory()}>
            {t("Try Again")}
          </Button>
        </div>
      )}

      {loading ? (
        <Card className="assessment-history-loading">
          <span className="spinner" /> {t("Loading assessment history…")}
        </Card>
      ) : assessments.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileVideo}
            title={t("No completed assessments yet")}
            description={t("Upload a video of your practical work to create your first assessment.")}
          >
            <LinkButton href="/assessments/new/upload" icon={Plus}>
              {t("Start Assessment")}
            </LinkButton>
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="assessment-history-grid">
            {assessments.map((assessment) => (
              <AssessmentHistoryCard assessment={assessment} key={assessment.id} />
            ))}
          </div>
          {assessments.length < total && (
            <div className="assessment-history-more">
              <Button
                variant="secondary"
                disabled={loadingMore}
                onClick={() => void loadHistory(assessments.length)}
              >
                {loadingMore ? t("Loading…") : t("Load More")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
