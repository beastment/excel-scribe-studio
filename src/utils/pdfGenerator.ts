/**
 * PDF report generator for Thematic Analysis results.
 * Uses jsPDF and jspdf-autotable to create a professional summary report
 * including executive summary, theme table, demographic breakdown tables,
 * and example verbatim comments per theme.
 */
import jsPDF from "jspdf";
import autoTable, { UserOptions } from "jspdf-autotable";

export interface TAComment {
  id: string;
  text: string;
  department?: string;
  gender?: string;
  age?: string;
  role?: string;
}

export interface TATheme {
  id: string;
  name: string;
  description: string;
  frequency: number;
  sentiment: "positive" | "negative" | "neutral";
  keywords: string[];
  comments: TAComment[];
}

export interface TADemographicBreakdown {
  department: Record<string, TATheme[]>;
  gender: Record<string, TATheme[]>;
  age: Record<string, TATheme[]>;
  role: Record<string, TATheme[]>;
}

export interface TASummary {
  totalComments: number;
  totalThemes: number;
  averageSentiment: number;
  topTheme: TATheme | null;
}

export interface TAResultExport {
  themes: TATheme[];
  demographicBreakdown: TADemographicBreakdown;
  summary: TASummary;
  taggedComments: TAComment[];
}

/**
 * Generate and download a PDF report for a Thematic Analysis result
 */
export function generateThematicAnalysisPDF(data: TAResultExport): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const marginX = 40;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Thematic Analysis Report", marginX, 48);

  // Executive summary
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const execYStart = 72;
  const topThemeName = data.summary.topTheme ? data.summary.topTheme.name : "N/A";
  const avgSent = data.summary.averageSentiment;
  const sentimentLabel = avgSent > 0.2 ? "Overall positive" : avgSent < -0.2 ? "Overall negative" : "Balanced";
  const summaryText = [
    `Total comments: ${data.summary.totalComments}`,
    `Themes identified: ${data.summary.totalThemes}`,
    `Top theme: ${topThemeName}`,
    `Overall sentiment: ${sentimentLabel} (${avgSent.toFixed(2)})`,
  ].join("\n");
  doc.text(summaryText, marginX, execYStart);

  // Themes table
  const themesTableBody = data.themes.map((t) => [
    t.name,
    t.description,
    t.frequency.toString(),
    t.sentiment,
    t.keywords.join(", ")
  ]);

  autoTable(doc, {
    head: [["Theme", "Descriptor", "Frequency", "Sentiment", "Keywords"]],
    body: themesTableBody,
    startY: execYStart + 24,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [33, 150, 243] },
  } as UserOptions);

  // Demographic breakdowns (one table per dimension)
  const dims: Array<keyof TADemographicBreakdown> = ["department", "gender", "age", "role"];
  let currentY = (doc as any).lastAutoTable?.finalY || execYStart + 24;
  for (const dim of dims) {
    const groups = data.demographicBreakdown[dim];
    const rows: string[][] = [];
    Object.keys(groups).forEach((groupName) => {
      const groupThemes = groups[groupName];
      const counts: Record<string, number> = {};
      groupThemes.forEach((th) => {
        counts[th.name] = (counts[th.name] || 0) + th.frequency;
      });
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const themeSummary = Object.keys(counts)
        .sort((a, b) => counts[b] - counts[a])
        .slice(0, 5)
        .map((k) => `${k} (${((counts[k] / Math.max(1, total)) * 100).toFixed(0)}%)`)
        .join(", ");
      rows.push([groupName, total.toString(), themeSummary]);
    });

    if (rows.length > 0) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`Demographic breakdown: ${dim}`, marginX, 48);
      autoTable(doc, {
        head: [["Group", "Total Tagged", "Top Themes (share)"]],
        body: rows,
        startY: 64,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [76, 175, 80] },
      } as UserOptions);
      currentY = (doc as any).lastAutoTable?.finalY || 64;
    }
  }

  // Example comments per top theme
  if (data.themes.length > 0) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Example comments per theme", marginX, 48);

    const topThemes = [...data.themes].sort((a, b) => b.frequency - a.frequency).slice(0, 5);
    let y = 64;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    topThemes.forEach((t, idx) => {
      const header = `${idx + 1}. ${t.name} — ${t.description}`;
      doc.setFont("helvetica", "bold");
      doc.text(header, marginX, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      const examples = t.comments.slice(0, 3).map((c) => `• ${truncate(c.text, 220)}`);
      examples.forEach((e) => {
        const wrapped = doc.splitTextToSize(e, pageWidth - marginX * 2);
        doc.text(wrapped as string[], marginX, y);
        y += 12 + (wrapped.length - 1) * 10;
      });
      y += 6;
      if (y > doc.internal.pageSize.getHeight() - 72) {
        doc.addPage();
        y = 48;
      }
    });
  }

  doc.save("thematic-analysis-report.pdf");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}



