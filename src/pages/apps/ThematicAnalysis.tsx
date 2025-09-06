import React, { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Upload, FileText, FileSpreadsheet, File } from "lucide-react";
import * as XLSX from "xlsx";
import { generateThematicAnalysisPDF, TAResultExport, TATheme, TAComment } from "@/utils/pdfGenerator";
import { sanitizeForExport } from "@/lib/utils";

type ParsedRow = Record<string, string>;

const REQUIRED_COMMENT_FIELD = "text";

const ThematicAnalysis: React.FC = () => {
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<TAResultExport | null>(null);
  const [fileLabel, setFileLabel] = useState<string>("");

  const columns = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [rows]);

  const handlePick = () => fileInputRef.current?.click();

  const parseCSV = (text: string) => {
    // Simple CSV parser for comma-separated with optional quotes
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [] as ParsedRow[];
    const header = splitCsvLine(lines[0]);
    const out: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = splitCsvLine(lines[i]);
      const row: ParsedRow = {};
      header.forEach((h, idx) => (row[h.trim()] = (vals[idx] ?? "").trim()));
      out.push(row);
    }
    return out;
  };

  const splitCsvLine = (line: string): string[] => {
    const res: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        res.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    res.push(cur);
    return res;
  };

  const parseXlsx = async (file: File) => {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: "" });
  };

  const parseDocx = async (file: File) => {
    const data = await file.arrayBuffer();
    // Lightweight extraction: search for <w:t> nodes in raw XML (works for simple docs)
    const utf8 = new TextDecoder("utf-8").decode(new Uint8Array(data));
    const matches = utf8.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    const text = matches.map((m) => m.replace(/<[^>]*>/g, "")).join(" ").replace(/\s+/g, " ").trim();
    // Split by paragraphs / sentences to produce rows with a single "text" field
    const lines = text.split(/\n+|\.|!|\?\s/).map((s) => s.trim()).filter((s) => s.length > 10);
    return lines.map((t, i) => ({ id: `docx-${i + 1}`, text: t }));
  };

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setFileLabel(file.name);
    try {
      const isCSV = file.name.toLowerCase().endsWith(".csv");
      const isXLSX = file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");
      const isDOCX = file.name.toLowerCase().endsWith(".docx");
      if (!isCSV && !isXLSX && !isDOCX) {
        toast.error("Please upload a CSV, Excel (.xlsx), or Word (.docx) file");
        return;
      }
      let parsed: ParsedRow[] = [];
      if (isCSV) {
        const text = await file.text();
        parsed = parseCSV(text);
      } else if (isXLSX) {
        parsed = await parseXlsx(file);
      } else if (isDOCX) {
        parsed = await parseDocx(file);
      }
      if (parsed.length === 0) {
        toast.warning("No rows found in the file");
      }
      setRows(parsed);
      setFileLabel(`${file.name} — ${parsed.length} rows`);
      toast.success(`Loaded ${parsed.length} rows`);
    } catch (err) {
      toast.error("Failed to parse file");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const runAnalysis = async () => {
    if (!session) {
      toast.error("Please sign in to run analysis");
      return;
    }
    if (rows.length === 0) {
      toast.error("Please upload a file first");
      return;
    }
    // Build comments array: require a text column; keep demographics if present
    const comments: TAComment[] = rows
      .map((r, idx) => ({
        id: String(r.id ?? idx + 1),
        text: String(r[REQUIRED_COMMENT_FIELD] ?? ""),
        department: toStr(r.department),
        gender: toStr(r.gender),
        age: toStr(r.age),
        role: toStr(r.role),
      }))
      .filter((c) => c.text.trim().length > 0);

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("thematic-analysis", {
        body: {
          comments,
          userId: session.user.id
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (error) throw error;
      if (!data?.success) {
        toast.error(data?.error || "Analysis failed");
        return;
      }
      setResult(data.result as TAResultExport);
      toast.success("Analysis complete");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Edge Function error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const exportTaggedCSV = () => {
    if (!result) return;
    const rows: Array<Record<string, string>> = result.taggedComments.map((c) => ({
      id: c.id,
      text: c.text,
      department: c.department ?? "",
      gender: c.gender ?? "",
      age: c.age ?? "",
      role: c.role ?? "",
      themes: result.themes
        .filter((t) => t.comments.some((x) => x.id === c.id))
        .map((t) => t.name)
        .join("; "),
    }));
    const csv = toCSV(rows);
    downloadFile(csv, "tagged-comments.csv", "text/csv");
  };

  const exportTaggedXLSX = () => {
    if (!result) return;
    const rows: Array<Record<string, string>> = result.taggedComments.map((c) => ({
      id: c.id,
      text: c.text,
      department: c.department ?? "",
      gender: c.gender ?? "",
      age: c.age ?? "",
      role: c.role ?? "",
      themes: result.themes
        .filter((t) => t.comments.some((x) => x.id === c.id))
        .map((t) => t.name)
        .join("; "),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tagged Comments");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    downloadFile(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "tagged-comments.xlsx");
  };

  const exportPDF = () => {
    if (!result) return;
    try {
      generateThematicAnalysisPDF(result);
      toast.success("PDF report generated");
    } catch {
      toast.error("Failed to generate PDF");
    }
  };

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Thematic Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <Input type="file" ref={fileInputRef} onChange={handleFile} accept=".csv,.xlsx,.xls,.docx" className="hidden" />
            <Button variant="outline" onClick={handlePick}>
              <Upload className="w-4 h-4 mr-2" /> Choose File
            </Button>
            {fileLabel && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>{fileLabel}</span>
              </div>
            )}
            <Button onClick={runAnalysis} disabled={loading || rows.length === 0}>
              {loading ? "Analyzing..." : "Run Analysis"}
            </Button>
          </div>

          <Tabs defaultValue="themes">
            <TabsList>
              <TabsTrigger value="themes">Themes</TabsTrigger>
              <TabsTrigger value="demographics">Demographics</TabsTrigger>
              <TabsTrigger value="comments">Comments</TabsTrigger>
              <TabsTrigger value="visuals">Visualizations</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>

            <TabsContent value="themes">
              {result ? (
                <div className="space-y-3">
                  {result.themes.map((t) => (
                    <div key={t.id} className="p-3 border rounded-md">
                      <div className="font-semibold">{t.name} ({t.frequency})</div>
                      <div className="text-sm text-muted-foreground mb-1">{t.description}</div>
                      <div className="text-xs">Keywords: {t.keywords.join(", ")}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No results yet.</div>
              )}
            </TabsContent>

            <TabsContent value="demographics">
              {result ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {(["department", "gender", "age", "role"] as const).map((dim) => (
                    <div key={dim} className="p-3 border rounded-md">
                      <div className="font-semibold capitalize mb-2">{dim}</div>
                      {Object.keys(result.demographicBreakdown[dim]).length === 0 ? (
                        <div className="text-sm text-muted-foreground">No data</div>
                      ) : (
                        <ul className="list-disc ml-5 text-sm">
                          {Object.entries(result.demographicBreakdown[dim]).map(([k, list]) => (
                            <li key={k}>
                              <span className="font-medium">{k}:</span> {list.map((t) => `${t.name} (${t.frequency})`).join(", ")}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No results yet.</div>
              )}
            </TabsContent>

            <TabsContent value="comments">
              {result ? (
                <div className="space-y-2">
                  {result.taggedComments.map((c) => (
                    <div key={c.id} className="p-3 border rounded-md">
                      <div className="text-sm">{c.text}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {(c.department || c.gender || c.age || c.role) && (
                          <span>
                            {c.department ? `Dept: ${c.department} ` : ""}
                            {c.gender ? `Gender: ${c.gender} ` : ""}
                            {c.age ? `Age: ${c.age} ` : ""}
                            {c.role ? `Role: ${c.role}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No results yet.</div>
              )}
            </TabsContent>

            <TabsContent value="visuals">
              {result ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Placeholder visual summaries. You can replace with charts using recharts */}
                  <div className="p-3 border rounded-md">
                    <div className="font-semibold mb-2">Theme distribution</div>
                    <ul className="list-disc ml-5 text-sm">
                      {result.themes.map((t) => (
                        <li key={t.id}>{t.name}: {(t.frequency / Math.max(1, result.summary.totalComments) * 100).toFixed(0)}%</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-3 border rounded-md">
                    <div className="font-semibold mb-2">Sentiment</div>
                    <div className="text-sm text-muted-foreground">Average sentiment: {result.summary.averageSentiment.toFixed(2)}</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No results yet.</div>
              )}
            </TabsContent>

            <TabsContent value="export">
              <div className="flex flex-wrap gap-2">
                <Button onClick={exportTaggedCSV} variant="outline">
                  <FileText className="w-4 h-4 mr-2" /> Export Tagged (CSV)
                </Button>
                <Button onClick={exportTaggedXLSX} variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> Export Tagged (XLSX)
                </Button>
                <Button onClick={exportPDF}>
                  <Download className="w-4 h-4 mr-2" /> Download PDF Report
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

function toCSV(objRows: Array<Record<string, string>>): string {
  if (objRows.length === 0) return "";
  const headers = Object.keys(objRows[0]);
  const lines = [headers.join(",")];
  for (const row of objRows) {
    const vals = headers.map((h) => quoteCsv(row[h] ?? ""));
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}

function quoteCsv(v: string): string {
  // Sanitize against formula injection
  if (v.match(/^[=+\-@]/)) {
    v = `'${v}`; // Prefix with single quote to neutralize
  }
  
  const needs = v.includes(",") || v.includes("\n") || v.includes("\r") || v.includes('"');
  if (!needs) return v;
  return '"' + v.replace(/"/g, '""') + '"';
}

function downloadFile(data: string | Blob, filename: string, mimeType?: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length === 0 ? undefined : s;
}

export default ThematicAnalysis;
