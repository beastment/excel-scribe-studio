import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

interface Comment {
  id: string;
  text: string;
  department?: string;
  gender?: string;
  age?: string;
  role?: string;
}

interface Theme {
  id: string;
  name: string;
  description: string;
  frequency: number;
  sentiment: "positive" | "negative" | "neutral";
  keywords: string[];
  comments: Comment[];
}

interface DemographicBreakdown {
  department: Record<string, Theme[]>;
  gender: Record<string, Theme[]>;
  age: Record<string, Theme[]>;
  role: Record<string, Theme[]>;
}

interface AnalysisResult {
  themes: Theme[];
  demographicBreakdown: DemographicBreakdown;
  summary: {
    totalComments: number;
    totalThemes: number;
    averageSentiment: number;
    topTheme: Theme | null;
  };
  taggedComments: Comment[];
}

interface ThematicAnalysisRequest {
  comments: Comment[];
  userId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Health check
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ success: true, message: "Thematic Analysis OK", ts: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = (await req.json()) as ThematicAnalysisRequest;
    if (!body?.comments || !Array.isArray(body.comments) || body.comments.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No comments provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }
    if (!body.userId) {
      return new Response(
        JSON.stringify({ success: false, error: "User ID required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Authorization header required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }
    const supabaseAdmin = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !userData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Authentication failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Minimal heuristic theming (placeholder) – replace with AI call if desired
    const comments = body.comments.map((c) => ({ ...c, text: (c.text || "").trim() })).filter((c) => c.text.length > 0);
    const keywords = [
      { name: "Leadership & Communication", keys: ["leader", "leadership", "manager", "communication", "communicate"] },
      { name: "Workload & Resourcing", keys: ["workload", "overtime", "understaff", "resource", "capacity"] },
      { name: "Culture & Team", keys: ["culture", "team", "collaboration", "support", "inclusive"] },
      { name: "Pay & Benefits", keys: ["pay", "salary", "benefit", "compensation", "bonus"] },
      { name: "Environment & Tools", keys: ["office", "equipment", "tools", "remote", "hybrid"] },
    ];

    const lower = (s: string) => s.toLowerCase();
    const themes: Theme[] = keywords.map((k, i) => ({
      id: `theme-${i + 1}`,
      name: k.name,
      description: `Comments relating to ${k.name.toLowerCase()}.`,
      frequency: 0,
      sentiment: "neutral",
      keywords: k.keys,
      comments: []
    }));

    comments.forEach((c) => {
      const text = lower(c.text);
      let matched = false;
      for (const t of themes) {
        if (t.keywords.some((kw) => text.includes(kw))) {
          t.comments.push(c);
          matched = true;
        }
      }
      if (!matched) {
        // If nothing matched, put into Culture as general feedback
        themes[2].comments.push(c);
      }
    });

    // Frequency & basic sentiment (very naive):
    const posWords = ["great", "good", "excellent", "love", "supportive", "happy"];
    const negWords = ["bad", "poor", "terrible", "hate", "toxic", "unhappy", "overwhelmed"];
    themes.forEach((t) => {
      t.frequency = t.comments.length;
      const score = t.comments.reduce((sum, c) => {
        const txt = lower(c.text);
        let s = 0;
        if (posWords.some((w) => txt.includes(w))) s += 1;
        if (negWords.some((w) => txt.includes(w))) s -= 1;
        return sum + s;
      }, 0);
      t.sentiment = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
    });

    // Demographic breakdown
    const demographicBreakdown: DemographicBreakdown = { department: {}, gender: {}, age: {}, role: {} };
    const addToGroup = (map: Record<string, Theme[]>, key: string, theme: Theme) => {
      if (!map[key]) map[key] = [];
      if (!map[key].some((x) => x.id === theme.id)) map[key].push(theme);
    };
    themes.forEach((t) => {
      t.comments.forEach((c) => {
        if (c.department) addToGroup(demographicBreakdown.department, c.department, t);
        if (c.gender) addToGroup(demographicBreakdown.gender, c.gender, t);
        if (c.age) addToGroup(demographicBreakdown.age, c.age, t);
        if (c.role) addToGroup(demographicBreakdown.role, c.role, t);
      });
    });

    const totalComments = comments.length;
    const nonZero = themes.filter((t) => t.frequency > 0);
    const topTheme = nonZero.sort((a, b) => b.frequency - a.frequency)[0] || null;
    const averageSentiment = themes.reduce((sum, t) => sum + (t.sentiment === "positive" ? 1 : t.sentiment === "negative" ? -1 : 0) * t.frequency, 0) / Math.max(1, totalComments);

    const response: AnalysisResult = {
      themes,
      demographicBreakdown,
      summary: {
        totalComments,
        totalThemes: themes.length,
        averageSentiment,
        topTheme
      },
      taggedComments: comments
    };

    return new Response(
      JSON.stringify({ success: true, result: response }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});


