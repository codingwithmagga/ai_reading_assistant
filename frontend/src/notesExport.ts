import { NotesExportResponse } from "./api";
import { Copy, getEntityTypeLabel } from "./i18n";

function escapeMarkdown(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\x5B\x5D()#+.!|>~-])/g, "\\$1");
}

function safeFileName(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || "book";
}

function toMarkdown(data: NotesExportResponse, copy: Copy): string {
  const lines = [
    `# ${escapeMarkdown(data.title)}`,
    "",
    `**${escapeMarkdown(copy.exportPosition)}:** ${data.position + 1}`,
  ];
  if (data.author) {
    lines.push("", `**${escapeMarkdown(copy.author)}:** ${escapeMarkdown(data.author)}`);
  }

  lines.push("", `## ${escapeMarkdown(copy.knownEntities)}`);
  if (data.entities.length === 0) {
    lines.push("", escapeMarkdown(copy.noKnownEntities));
  }
  for (const entity of data.entities) {
    lines.push(
      "",
      `### ${escapeMarkdown(entity.canonical_name)} (${escapeMarkdown(
        getEntityTypeLabel(entity.type, copy),
      )})`,
    );
    if (entity.aliases.length > 0) {
      lines.push(
        "",
        `- **${escapeMarkdown(copy.aliases)}:** ${entity.aliases
          .map((alias) => escapeMarkdown(alias.alias))
          .join(", ")}`,
      );
    }
    if (entity.facts.length > 0) {
      lines.push("", `**${escapeMarkdown(copy.facts)}**`);
      for (const fact of entity.facts) {
        const chapter = fact.chapter_title || `${copy.chapter} ${fact.chapter_index + 1}`;
        lines.push(
          "",
          `- ${escapeMarkdown(fact.text)} (${escapeMarkdown(chapter)}, ${
            fact.position + 1
          })`,
          `  - **${escapeMarkdown(copy.source)}:** ${escapeMarkdown(
            fact.source_excerpt,
          )}`,
        );
      }
    }
  }

  lines.push("", `## ${escapeMarkdown(copy.relationships)}`);
  if (data.relationships.length === 0) {
    lines.push("", escapeMarkdown(copy.noKnownRelationships));
  } else {
    for (const relationship of data.relationships) {
      lines.push(
        "",
        `- ${escapeMarkdown(relationship.entity_a.canonical_name)} ${escapeMarkdown(
          relationship.label,
        )} ${escapeMarkdown(relationship.entity_b.canonical_name)} (${
          relationship.position + 1
        })`,
      );
    }
  }

  lines.push("", `## ${escapeMarkdown(copy.recapTitle)}`);
  if (data.events.length === 0) {
    lines.push("", escapeMarkdown(copy.noRecapEvents));
  } else {
    for (const event of data.events) {
      const chapter = event.chapter_title || `${copy.chapter} ${event.chapter_index + 1}`;
      lines.push(
        "",
        `- ${escapeMarkdown(event.text)} (${escapeMarkdown(chapter)}, ${
          event.position + 1
        })`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export function downloadNotesExport(
  data: NotesExportResponse,
  format: "json" | "markdown",
  copy: Copy,
): void {
  const markdown = format === "markdown";
  const content = markdown ? toMarkdown(data, copy) : `${JSON.stringify(data, null, 2)}\n`;
  const blob = new Blob([content], {
    type: markdown ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(data.title)}-notes.${markdown ? "md" : "json"}`;
  link.click();
  URL.revokeObjectURL(url);
}
