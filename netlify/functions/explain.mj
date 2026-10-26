import { getStore } from "@netlify/blobs";

const DAILY = Number(Netlify.env.get("DAILY_LIMIT") || 200);
const MODEL = Netlify.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

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
  try {
    const st = getStore("usage");
    const day = new Date().toISOString().slice(0, 10);
    const n = Number((await st.get(day)) || 0);
    if (n >= DAILY) return j({ error: "وصل الشرح حدّه اليومي. التحليل ما زال يعمل." }, 429);
    await st.set(day, String(n + 1));
  } catch (e) {}

  const prompt = `أنت مدرب شطرنج. اشرح بالعربية المبسّطة في جملتين إلى ثلاث جمل قصيرة سبب تصنيف النقلة كما هو، وما الفكرة الأفضل.
اعتمد فقط على المعطيات التالية ولا تخترع نقلات أخرى. التقييم بوحدة البيدق من وجهة نظر اللاعب الذي نفّذ النقلة.
الموقف قبل النقلة (FEN): ${fen}
اللاعب: ${s(b.color)}
النقلة: ${s(b.played)}
تصنيفها: ${s(b.cls)}
أفضل نقلة للمحرك: ${s(b.best)}
التقييم قبل النقلة: ${s(b.before)}
التقييم بعدها: ${s(b.after)}`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );
    const d = await r.json();
    const text = d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim();
    if (!r.ok || !text) return j({ error: "تعذّر الحصول على شرح من Gemini." }, 502);
    return j({ text });
  } catch (e) {
    return j({ error: "تعذّر الاتصال بـ Gemini." }, 502);
  }
};

export const config = { path: "/api/explain" };
