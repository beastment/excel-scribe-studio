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

type ParsedRow = Record<string, string>;

const REQUIRED_COMMENT_FIELD = "text";

const ThematicAnalysis: React.FC = () => {
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<TAResultExport | null>(null);

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
            <Input type="file" ref={fileInputRef} onChange={handleFile} accept=".csv,.xlsx,.xls,.docx" />
            <Button variant="outline" onClick={handlePick}>
              <Upload className="w-4 h-4 mr-2" /> Choose File
            </Button>
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
  const needs = v.includes(",") || v.includes("\n") || v.includes("\r") || v.includes('"');
  if (!needs) return v;
  return '"' + v.replace(/"/g, '""') + '"';
}

function toStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length === 0 ? undefined : s;
}

export default ThematicAnalysis;

import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  BrainCircuit, 
  ArrowRight,
  Check,
  Settings,
  TrendingUp,
  BarChart,
  Target,
  Users
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { EditableText } from '@/components/EditableText';

const ThematicAnalysis = () => {
  const { user } = useAuth();

  const features = [
    {
      icon: BrainCircuit,
      title: "AI-Powered Topic Modeling",
      description: "Advanced machine learning algorithms identify hidden themes and patterns in your feedback data."
    },
    {
      icon: TrendingUp,
      title: "Sentiment Analysis",
      description: "Understand not just what employees are saying, but how they feel about each topic."
    },
    {
      icon: BarChart,
      title: "Trend Detection",
      description: "Track how themes evolve over time and identify emerging issues before they become problems."
    },
    {
      icon: Target,
      title: "Priority Scoring",
      description: "Automatically rank themes by frequency, sentiment, and potential impact on your organization."
    }
  ];

  const benefits = [
    "Discover hidden insights in thousands of comments automatically",
    "Track employee sentiment across different topics and departments",
    "Identify emerging trends and issues early",
    "Generate data-driven action plans",
    "Save weeks of manual analysis time"
  ];

  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-purple-50 py-20 lg:py-32">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center space-x-2 bg-orange-100 text-orange-800 px-4 py-2 rounded-full text-sm font-medium mb-8">
              <Settings className="w-4 h-4" />
              <span>In Development</span>
            </div>
            
            <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <BrainCircuit className="w-10 h-10 text-white" />
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              <EditableText contentKey="thematic-analysis-title" as="span">Thematic </EditableText>
              <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                <EditableText contentKey="thematic-analysis-title-highlight" as="span"> Analysis</EditableText>
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-3xl mx-auto">
              <EditableText contentKey="thematic-analysis-description" as="span">
                Automatically discover and categorize key themes and sentiment from thousands of employee comments. 
                Turn unstructured feedback into actionable insights.
              </EditableText>
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
              <Link to="/contact">
                <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-8 py-4 text-lg rounded-xl transition-all duration-300">
                  Get in Touch
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              <EditableText contentKey="thematic-analysis-features-title" as="span">Advanced Theme Discovery</EditableText>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              <EditableText contentKey="thematic-analysis-features-description" as="span">Our AI analyzes patterns in language, emotion, and context to reveal the true voice of your employees.</EditableText>
            </p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                      <feature.icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-3 text-gray-900">
                        <EditableText contentKey={`thematic-analysis-feature-${index}-title`} as="span">{feature.title}</EditableText>
                      </h3>
                      <p className="text-gray-600 leading-relaxed">
                        <EditableText contentKey={`thematic-analysis-feature-${index}-desc`} as="span">{feature.description}</EditableText>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-gradient-to-br from-gray-50 to-purple-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
                <EditableText contentKey="thematic-analysis-why-title" as="span">Transform Feedback Into Intelligence</EditableText>
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                <EditableText contentKey="thematic-analysis-why-description" as="span">Stop spending weeks manually categorizing feedback. Let AI reveal the patterns and insights that matter most.</EditableText>
              </p>
              
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <p className="text-gray-700 font-medium">
                      <EditableText contentKey={`thematic-analysis-benefit-${index}`} as="span">{benefit}</EditableText>
                    </p>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Coming Soon</h3>
              
              <div className="mb-6">
                <Badge className="bg-orange-100 text-orange-800 mb-4">
                  <Settings className="w-3 h-3 mr-1" />
                  In Development
                </Badge>
                <div className="text-4xl font-bold text-gray-900 mb-2">Pricing yet to be confirmed</div>
              </div>
              
              <div className="space-y-3 mb-8">
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">AI-Powered Topic Modeling</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Sentiment Analysis</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Trend Detection</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Priority Scoring</span>
                </div>
              </div>
              
              <Link to="/contact">
                <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-3 rounded-xl font-medium transition-all duration-300">
                  Get in Touch
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-purple-600 to-pink-600">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
            <EditableText contentKey="thematic-analysis-cta-title" as="span">Be First to Unlock Hidden Insights</EditableText>
          </h2>
          <p className="text-xl text-purple-100 mb-10">
            <EditableText contentKey="thematic-analysis-cta-description" as="span">Join our early access program and be among the first to experience AI-powered thematic analysis.</EditableText>
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <Link to="/contact">
              <Button className="bg-white text-purple-600 hover:bg-gray-50 px-8 py-4 text-lg rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                Get in Touch
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ThematicAnalysis;