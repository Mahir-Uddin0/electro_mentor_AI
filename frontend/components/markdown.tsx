import { Fragment, type ReactNode } from "react";

type MarkdownProps = {
  content: string;
  className?: string;
};

function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:|\/)/i.test(url.trim());
}

export function cleanMarkdownPreview(text: string): string {
  return text
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function renderInline(text: string): ReactNode {
  const tokenRegex =
    /(\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|__[\s\S]+?__|~~[\s\S]+?~~|`[^`\n]+`|\*[^\*\r\n]+?\*|_[^_\r\n]+?_|\[[^\]]+\]\([^\)]+\))/g;

  const parts = text.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith("***") && part.endsWith("***") && part.length >= 6) {
      return (
        <strong key={index}>
          <em>{renderInline(part.slice(3, -3))}</em>
        </strong>
      );
    }

    if (
      (part.startsWith("**") && part.endsWith("**") && part.length >= 4) ||
      (part.startsWith("__") && part.endsWith("__") && part.length >= 4)
    ) {
      return <strong key={index}>{renderInline(part.slice(2, -2))}</strong>;
    }

    if (part.startsWith("~~") && part.endsWith("~~") && part.length >= 4) {
      return <del key={index}>{renderInline(part.slice(2, -2))}</del>;
    }

    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code key={index} className="chat-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (
      (part.startsWith("*") && part.endsWith("*") && part.length >= 2) ||
      (part.startsWith("_") && part.endsWith("_") && part.length >= 2)
    ) {
      return <em key={index}>{renderInline(part.slice(1, -1))}</em>;
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      if (isSafeUrl(url)) {
        return (
          <a
            key={index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="chat-link"
          >
            {renderInline(label)}
          </a>
        );
      }
      return <span key={index}>{label}</span>;
    }

    if (part.includes("\n")) {
      const sublines = part.split("\n");
      return (
        <Fragment key={index}>
          {sublines.map((sub, sIdx) => (
            <Fragment key={sIdx}>
              {sIdx > 0 && <br />}
              {sub}
            </Fragment>
          ))}
        </Fragment>
      );
    }

    return <Fragment key={index}>{part}</Fragment>;
  });
}

type Block =
  | { type: "code_block"; language: string; code: string }
  | { type: "heading"; level: number; text: string }
  | { type: "unordered_list"; items: string[] }
  | { type: "ordered_list"; items: string[] }
  | { type: "blockquote"; text: string }
  | { type: "hr" }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "paragraph"; lines: string[] };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      const match = line.trim().match(/^```(\w*)/);
      const language = match ? match[1] : "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({
        type: "code_block",
        language,
        code: codeLines.join("\n"),
      });
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const headingMatch =
      line.match(/^\s*(#{1,6})\s+(.*)$/) || line.match(/^\s*(#{2,6})\s*(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: (headingMatch[1] || headingMatch[3]).length,
        text: (headingMatch[2] || headingMatch[4]).trim(),
      });
      i++;
      continue;
    }

    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    if (
      line.trim().startsWith("|") &&
      line.trim().endsWith("|") &&
      i + 1 < lines.length &&
      lines[i + 1].includes("---") &&
      lines[i + 1].trim().startsWith("|")
    ) {
      const headers = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      i += 2;
      const rows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim().startsWith("|") &&
        lines[i].trim().endsWith("|")
      ) {
        rows.push(
          lines[i]
            .split("|")
            .slice(1, -1)
            .map((cell) => cell.trim()),
        );
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "blockquote",
        text: quoteLines.join("\n"),
      });
      continue;
    }

    if (/^\s*[\*\-]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[\*\-]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[\*\-]\s+/, ""));
        i++;
      }
      blocks.push({ type: "unordered_list", items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ordered_list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].match(/^\s*#{1,6}\s+/) &&
      !lines[i].match(/^\s*#{2,6}\S/) &&
      !lines[i].trim().startsWith(">") &&
      !/^\s*[\*\-]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(\*{3,}|-{3,}|_{3,})$/.test(lines[i].trim()) &&
      !(
        lines[i].trim().startsWith("|") &&
        i + 1 < lines.length &&
        lines[i + 1].includes("---")
      )
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", lines: paragraphLines });
    }
  }

  return blocks;
}

export function Markdown({ content, className = "" }: MarkdownProps) {
  if (!content) return null;

  const blocks = parseBlocks(content);

  return (
    <div className={`chat-markdown ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "code_block":
            return (
              <pre key={idx} className="chat-code-block">
                {block.language && (
                  <div className="chat-code-lang">{block.language}</div>
                )}
                <code>{block.code}</code>
              </pre>
            );

          case "heading": {
            if (block.level <= 2) {
              return (
                <h3 key={idx} className="chat-heading">
                  {renderInline(block.text)}
                </h3>
              );
            }
            if (block.level === 3) {
              return (
                <h4 key={idx} className="chat-heading">
                  {renderInline(block.text)}
                </h4>
              );
            }
            return (
              <h5 key={idx} className="chat-heading">
                {renderInline(block.text)}
              </h5>
            );
          }

          case "unordered_list":
            return (
              <ul key={idx} className="chat-list">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx}>{renderInline(item)}</li>
                ))}
              </ul>
            );

          case "ordered_list":
            return (
              <ol key={idx} className="chat-list">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx}>{renderInline(item)}</li>
                ))}
              </ol>
            );

          case "blockquote":
            return (
              <blockquote key={idx} className="chat-blockquote">
                {renderInline(block.text)}
              </blockquote>
            );

          case "hr":
            return <hr key={idx} className="chat-hr" />;

          case "table":
            return (
              <div key={idx} className="chat-table-wrap">
                <table className="chat-table">
                  <thead>
                    <tr>
                      {block.headers.map((header, hIdx) => (
                        <th key={hIdx}>{renderInline(header)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx}>{renderInline(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "paragraph":
          default:
            return (
              <p key={idx} className="chat-paragraph">
                {renderInline(block.lines.join("\n"))}
              </p>
            );
        }
      })}
    </div>
  );
}
