"use client";

import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Download,
  FileText,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Badge,
  Button,
  Card,
  LinkButton,
  PageHeading,
} from "@/components/ui";
import { frontendApi, type GuideDocument } from "@/lib/api/client";

const coverStyles = [
  "gradient-yellow",
  "gradient-blue",
  "gradient-purple",
  "gradient-cyan",
  "gradient-green",
];

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently updated"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function triggerDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function GuidesPage() {
  const [guides, setGuides] = useState<GuideDocument[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [sort, setSort] = useState("Title A–Z");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void frontendApi
      .listGuides()
      .then(({ documents }) => {
        if (active) setGuides(documents);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "The guide library could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(
    () => [...new Set(guides.map((guide) => guide.category))],
    [guides],
  );
  const visibleGuides = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matching = guides.filter(
      (guide) =>
        (category === "All Categories" || guide.category === category) &&
        (!normalized ||
          `${guide.title} ${guide.description} ${guide.category}`
            .toLowerCase()
            .includes(normalized)),
    );
    return matching.sort((left, right) => {
      if (sort === "Newest") {
        return right.updated_at.localeCompare(left.updated_at);
      }
      if (sort === "Most Pages") {
        return (right.page_count ?? 0) - (left.page_count ?? 0);
      }
      return left.title.localeCompare(right.title);
    });
  }, [category, guides, query, sort]);

  async function downloadGuide(guide: GuideDocument) {
    setError("");
    setDownloadingId(guide.id);
    try {
      const blob = await frontendApi.getGuideFile(guide.id, true);
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, guide.filename);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The guide PDF could not be downloaded.",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <>
      <PageHeading
        title="Wiring & Circuit Guide Library"
        description={`Browse ${guides.length} PDF electrical guides from the backend library.`}
      />

      <div className="filters">
        <label className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search guides…"
            aria-label="Search guides"
          />
        </label>
        <select
          className="select-field"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Category"
        >
          <option>All Categories</option>
          {categories.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select
          className="select-field"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort guides"
        >
          <option>Title A–Z</option>
          <option>Newest</option>
          <option>Most Pages</option>
        </select>
      </div>

      {error && <div className="auth-message error" style={{ marginBottom: 14 }}>{error}</div>}

      {loading ? (
        <div className="full-loader" style={{ minHeight: 320, background: "transparent" }}>
          <span className="spinner" /> Loading guide library…
        </div>
      ) : visibleGuides.length ? (
        <div className="content-grid">
          {visibleGuides.map((guide, index) => (
            <Card className="guide-card" key={guide.id}>
              <div className={`guide-cover ${coverStyles[index % coverStyles.length]}`}>
                <BookOpen size={38} />
                <Badge tone="blue">PDF</Badge>
              </div>
              <div className="guide-body">
                <Badge tone="blue">{guide.category}</Badge>
                <h3 style={{ marginTop: 10 }}>{guide.title}</h3>
                <p>{guide.description}</p>
                <div className="card-meta">
                  <span>
                    <FileText size={12} />
                    {guide.page_count ? `${guide.page_count} pages` : "PDF"}
                  </span>
                  <span>{formatFileSize(guide.file_size_bytes)}</span>
                  <span><CalendarDays size={12} /> {formatDate(guide.updated_at)}</span>
                </div>
                <div className="guide-card-actions">
                  <LinkButton
                    href={`/guides/${guide.id}`}
                    variant="secondary"
                    icon={ArrowRight}
                  >
                    Open PDF
                  </LinkButton>
                  <Button
                    variant="ghost"
                    icon={Download}
                    disabled={downloadingId === guide.id}
                    onClick={() => void downloadGuide(guide)}
                  >
                    {downloadingId === guide.id ? "Downloading…" : "Download"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="empty-state">
          <span className="empty-icon"><BookOpen size={28} /></span>
          <h2>No guides found</h2>
          <p>
            {guides.length
              ? "Try a different search term or category."
              : "Add PDF files to backend/data/wiring_circuit_guide_library and reload this page."}
          </p>
        </Card>
      )}
    </>
  );
}
