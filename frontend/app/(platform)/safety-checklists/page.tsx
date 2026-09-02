"use client";

import {
  ArrowRight,
  Download,
  FileText,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Badge,
  Button,
  Card,
  LinkButton,
  PageHeading,
} from "@/components/ui";
import { useLanguage } from "@/components/language-provider";
import {
  frontendApi,
  type SafetyChecklistDocument,
} from "@/lib/api/client";

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function triggerDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function SafetyChecklistsPage() {
  const { locale, t } = useLanguage();
  const [checklists, setChecklists] = useState<SafetyChecklistDocument[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void frontendApi
      .listSafetyChecklists()
      .then(({ documents }) => {
        if (active) setChecklists(documents);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : t("Safety checklists could not be loaded."),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const categories = useMemo(
    () => [...new Set(checklists.map((checklist) => checklist.category))],
    [checklists],
  );
  const visibleChecklists = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return checklists.filter(
      (checklist) =>
        (category === "All Categories" || checklist.category === category) &&
        (!normalized ||
          `${checklist.title} ${checklist.description} ${checklist.category}`
            .toLowerCase()
            .includes(normalized)),
    );
  }, [category, checklists, query]);

  async function downloadChecklist(checklist: SafetyChecklistDocument) {
    setError("");
    setDownloadingId(checklist.id);
    try {
      const blob = await frontendApi.getSafetyChecklistFile(checklist.id, true);
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, checklist.filename);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("The PDF could not be downloaded."),
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <>
      <PageHeading
        title={t("Safety Checklist")}
        description={t("Open or download the latest safety-checklist PDFs provided by ElectroMentor.")}
        action={
          <LinkButton href="/safety-checklists/generate" icon={Sparkles}>
            {t("Generate with AI")}
          </LinkButton>
        }
      />

      <div className="filters">
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search checklists…")}
            aria-label={t("Search checklists…")}
          />
        </label>
        <select
          className="select-field"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label={t("Filter by category")}
        >
          <option value="All Categories">{t("All Categories")}</option>
          {categories.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>

      {error && <div className="auth-message error" style={{ marginBottom: 14 }}>{error}</div>}

      {loading ? (
        <div className="full-loader" style={{ minHeight: 300, background: "transparent" }}>
          <span className="spinner" /> {t("Loading safety checklists…")}
        </div>
      ) : visibleChecklists.length ? (
        <div className="checklist-grid">
          {visibleChecklists.map((checklist) => (
            <Card key={checklist.id} className="checklist-card">
              <Badge tone="blue">{checklist.category}</Badge>
              <h3>{checklist.title}</h3>
              <p>{checklist.description}</p>
              <div className="card-meta">
                <span>
                  <FileText size={13} />
                  {checklist.page_count
                    ? t("{{count}} pages", { count: new Intl.NumberFormat(locale).format(checklist.page_count) })
                    : t("PDF document")}
                </span>
                <span>{formatFileSize(checklist.file_size_bytes)}</span>
              </div>
              <div className="checklist-card-actions">
                <LinkButton
                  href={`/safety-checklists/${checklist.id}`}
                  variant="secondary"
                  icon={ArrowRight}
                >
                  {t("Open PDF")}
                </LinkButton>
                <Button
                  variant="ghost"
                  icon={Download}
                  disabled={downloadingId === checklist.id}
                  onClick={() => void downloadChecklist(checklist)}
                >
                  {downloadingId === checklist.id ? t("Downloading…") : t("Download")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="empty-state">
            <span className="empty-icon"><ShieldCheck size={28} /></span>
            <h2>{t("No checklists found")}</h2>
            <p>
              {checklists.length
                ? t("Try a different search term or category.")
                : t("Add PDF files to backend/data/safety_checklist and reload this page.")}
            </p>
          </div>
        </Card>
      )}
    </>
  );
}
