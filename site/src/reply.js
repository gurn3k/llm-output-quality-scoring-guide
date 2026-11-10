// Reading the judge's reply (ADR 0007) and deciding whether its verdict can be shown (ADRs 0008, 0011).
import { checkQuote } from "./quote.js";

export const VERDICTS = ["pass", "fail", "unclear"];
export const SOURCES = ["output", "input"];

// The JSON shape the judge must return. Sent to the API as the structured-output schema.
export const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "evidence_source", "quote", "reason"],
  properties: {
    verdict: { type: "string", enum: VERDICTS },
    evidence_source: { type: "string", enum: SOURCES },
    quote: { type: "string" },
    reason: { type: "string" },
  },
};

// Takes a Messages API response body. Returns { ok: true, verdict, evidence_source, quote, reason }
// or { ok: false, error, retry } where retry says whether one more attempt is worth making.
export function parseReply(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "No reply from the API.", retry: true };
  if (body.stop_reason === "refusal") return { ok: false, error: "The model declined to judge this item.", retry: false };
  if (body.stop_reason === "max_tokens") return { ok: false, error: "The reply was cut off before it finished.", retry: false };
  if (body.stop_reason !== "end_turn") return { ok: false, error: `Unexpected stop reason: ${body.stop_reason ?? "none"}.`, retry: true };
  const text = (body.content ?? []).filter((b) => b?.type === "text").map((b) => b.text).join("");
  let v;
  try { v = JSON.parse(text); } catch { return { ok: false, error: "The reply wasn't valid JSON.", retry: true }; }
  const problem = shapeProblem(v);
  if (problem) return { ok: false, error: problem, retry: true };
  return { ok: true, verdict: v.verdict, evidence_source: v.evidence_source, quote: v.quote, reason: v.reason.trim() };
}

function shapeProblem(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return "The reply wasn't a JSON object.";
  const keys = Object.keys(v).sort().join(",");
  if (keys !== "evidence_source,quote,reason,verdict") return `The reply had the wrong fields (${keys || "none"}).`;
  if (!VERDICTS.includes(v.verdict)) return `Unknown verdict "${v.verdict}".`;
  if (!SOURCES.includes(v.evidence_source)) return `Unknown evidence source "${v.evidence_source}".`;
  if (typeof v.quote !== "string" || typeof v.reason !== "string") return "Quote and reason must be text.";
  if (v.reason.trim() === "") return "The reply gave no reason.";
  return null;
}

// What the page may show for one item and criterion. status is one of:
//   "pass" | "fail"  shown, with a quote found in the text
//   "unclear"        the judge wasn't sure: goes to the review pile
//   "withheld"       a verdict without evidence the code could find: not shown, counted
//   "error"          no usable reply: counted
export function decide(item, parsed) {
  if (!parsed.ok) return { status: "error", reason: parsed.error };
  const base = { quote: parsed.quote, reason: parsed.reason, evidence_source: parsed.evidence_source, judgeVerdict: parsed.verdict };
  if (parsed.verdict === "unclear") return { ...base, status: "unclear" };
  // Evidence from the customer's message only counts for a failure (something the reply missed).
  if (parsed.evidence_source === "input" && parsed.verdict !== "fail") {
    return { ...base, status: "withheld", why: "A pass must quote the reply itself." };
  }
  const where = parsed.evidence_source === "input" ? item.input : item.output;
  const q = checkQuote(where, parsed.quote);
  if (!q.found) return { ...base, status: "withheld", why: q.reason };
  return { ...base, status: parsed.verdict };
}
