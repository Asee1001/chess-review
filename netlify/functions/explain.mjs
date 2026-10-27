import { getStore } from "@netlify/blobs";

const DAILY = Number(Netlify.env.get("DAILY_LIMIT") || 200);
// Tried in order. Set GEMINI_MODEL in Netlify to force a specific model first.
const MODELS = [
  Netlify.env.get("GEMINI_MODEL"),
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
].filter(Boolean);

export default async (req) => {
  const j = (o, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
  if (req.method !== "POST") return j({ error: "method" }, 405);

  const key = Netlify.env.get("GEMINI_API_KEY");
  if (!key) return j({ error: "مفتاح Gemini غير مضبوط في Netlify." }, 500);

  let b;
  try { b = await req.json(); } catch { return j({ error: "طلب غير صالح" }, 400); }
  const s = (x, n = 40) => String(x ?? "").slice(0, n);
  const fen = s(b.fen, 100);
  if (!/^[\w\/\- ]{10,100}$/.test(fen)) return j({ error: "FEN غير صالح" }, 400);

  // global daily cap (fails open if storage is unavailable)
  const day = new Date().toISOString().slice(0, 10);
  let store = null, used = 0;
  try {
    store = getStore("usage");
    used = Number((await store.get(day)) || 0);
    if (used >= DAILY) return j({ error: "وصل الشرح حدّه اليومي. التحليل ما زال يعمل." }, 429);
  } catch (e) { store = null; }

  const lang = b.lang === "en" ? "English" : "العربية المبسّطة";
  const prompt = `أنت مدرب شطرنج. اكتب الشرح باللغة: ${lang}، في جملتين إلى ثلاث جمل قصيرة، عن سبب تصنيف النقلة كما هو، وما الفكرة الأفضل.
اعتمد فقط على المعطيات التالية ولا تخترع نقلات أخرى. التقييم بوحدة البيدق من وجهة نظر اللاعب الذي نفّذ النقلة.
الموقف قبل النقلة (FEN): ${fen}
اللاعب: ${s(b.color)}
النقلة: ${s(b.played)}
تصنيفها: ${s(b.cls)}
أفضل نقلة للمحرك: ${s(b.best)}
التقييم قبل النقلة: ${s(b.before)}
التقييم بعدها: ${s(b.after)}`;

  let last = "";
  for (const model of MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
          }),
        }
      );
      const d = await r.json();
      const text = d?.candidates?.[0]?.content?.parts
        ?.filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join("")
        .trim();
      if (r.ok && text) {
        if (store) { try { await store.set(day, String(used + 1)); } catch (e) {} }
        return j({ text });
      }
      const why = d?.error?.message || d?.candidates?.[0]?.finishReason || d?.promptFeedback?.blockReason || "no text";
      last = `${model} (${r.status}): ${String(why).slice(0, 160)}`;
      console.error("Gemini failed", last);
      if (r.status === 400 && /api key/i.test(String(why))) break; // bad key: other models won't help
    } catch (e) {
      last = `${model}: ${String(e.message || e).slice(0, 100)}`;
      console.error("Gemini error", last);
    }
  }
  return j({ error: `تعذّر الحصول على شرح من Gemini. ${last}` }, 502);
};

export const config = { path: "/api/explain" };
