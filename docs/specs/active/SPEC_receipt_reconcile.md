# SPEC — Receipt Reconcile (matching lines to the catalog)

**Scope:** OurProvisions · Phase 3 · middle stage of receipt import
**Status:** Design settled, ready for BUILD
**Depends on:** SPEC_receipt_vision_extraction.md (consumes its `lines[]`)
**Feeds:** the review screen (SPEC_receipt_import.md) via `match_confidence`

---

## What this is

The **reconcile** stage: extracted lines → catalog matches. Input is the vision
call's `lines[]`. Output is each line tagged with `catalog_item_id` (or "new item")
and `match_confidence`, plus `match_source`. This confidence drives the review gate.

This is the SECOND confidence in the feature. Keep it distinct:
- `price_confidence` (extraction) = "how sure of what's printed"
- `match_confidence` (here)      = "how sure this maps to a catalog item"

## The design idea: two tiers = a cost decision

Matching every line via AI works but costs one API call per line, per receipt,
forever — including for "BANANAS" matched forty times. The two-tier split shifts
most matching to free deterministic code and sends only the genuinely-unknown
lines to the paid AI call.

Property that makes it worth it: **the Tier-2 fraction shrinks over time.** As the
catalog fills and confirmed matches accumulate, more lines resolve for free.
Cheaper and smarter each month.

```
lines[] ──► TIER 1 (deterministic, free) ──► confident? ──► catalog_item_id + auto
                                              │
                                              └─ unsure ──► TIER 2 (AI, paid) ──► match | new item
```

---

## Tier 1 — deterministic matcher (no API call)

Naive `===` fails instantly ("Whole milk, 1 gal" ≠ "whole milk 1g"). Real matching
is **normalize → score → threshold**.

```js
// tier1Match.js — free, instant, catches repeat purchases.
// Teaching notes inline; Dan is learning this.

// 1) NORMALIZE: make two differently-written names comparable.
//    lowercase, strip punctuation, collapse spaces, pull size tokens aside.
function normalize(s) {
  const sizeTokens = [];
  const cleaned = (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")           // punctuation → space
    .replace(/\b(\d+(?:\.\d+)?)(g|kg|oz|lb|ml|l|gal|ct|pk|pack)\b/g, (m) => {
      sizeTokens.push(m.trim());            // "1g","5oz" set aside, not noise
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { tokens: cleaned.split(" ").filter(Boolean), sizeTokens };
}

// 2) SCORE: token overlap (Jaccard) is cheap and reads well.
//    WHY not a fuzzy-string library yet: KISS. A readable function we can tune
//    beats a black box while we're still learning what real receipts look like.
function score(rawText, parsedName, catalogName) {
  const a = normalize(`${parsedName || ""} ${rawText || ""}`);
  const b = normalize(catalogName);
  const setB = new Set(b.tokens);
  const shared = a.tokens.filter(t => setB.has(t)).length;
  const union = new Set([...a.tokens, ...b.tokens]).size || 1;
  return shared / union;                    // 0..1
}

// 3) THRESHOLD: only claim a match we're sure of. Unsure → hand to Tier 2.
//    A wrong silent match is worse than a paid Tier-2 call.
const TIER1_THRESHOLD = 0.85;

export function tier1Reconcile(lines, catalog /* [{id,name,category}] */) {
  const matched = [];
  const leftovers = [];
  for (const line of lines) {
    let best = { id: null, name: null, s: 0 };
    for (const item of catalog) {
      const s = score(line.raw_text, line.parsed_name, item.name);
      if (s > best.s) best = { id: item.id, name: item.name, s };
    }
    if (best.s >= TIER1_THRESHOLD) {
      matched.push({
        ...line,
        catalog_item_id: best.id,
        match_confidence: best.s,
        match_source: "deterministic",
        status: "auto"
      });
    } else {
      leftovers.push(line);                 // Tier 2 decides these
    }
  }
  return { matched, leftovers };
}
```

## Tier 2 — AI fallback (only the leftovers)

### System prompt (verbatim)

```
You match receipt line items to a household's product catalog. You receive a
catalog (array of {id, name, category}) and unmatched receipt lines. For each
line, return the best catalog match OR mark it as a new item. Be honest: a line
that is genuinely a new product should be returned as new — that is a correct
answer, not a failure. Never force a weak match.

Return ONLY this JSON, no prose, no fence:

{
  "matches": [
    {
      "raw_text": string,              // echo the line, so caller can align
      "catalog_item_id": string | null,// matched id, or null if new item
      "match_confidence": number,      // 0.0–1.0 for the mapping (not the OCR)
      "is_new_item": boolean,          // true if no good catalog match exists
      "suggested_name": string | null, // clean name to use if creating new
      "suggested_category": string | null
    }
  ]
}

Rules:
- Confidence is about the MAPPING to the catalog, not about reading the receipt.
- 0.85+: strong match. 0.5–0.85: plausible, human should confirm. <0.5 or no
  sensible candidate: is_new_item=true, catalog_item_id=null.
- Do not invent catalog ids. Only use ids present in the catalog you were given.
- Output JSON only.
```

### The call

```js
// tier2Match.js — paid fallback, only for Tier 1 leftovers.
async function tier2Reconcile(leftovers, catalog) {
  if (leftovers.length === 0) return { matches: [] };   // never pay if not needed

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",     // confirm current string at build
      max_tokens: 1200,
      system: TIER2_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: JSON.stringify({ catalog, lines: leftovers })
      }]
    })
  });

  const data = await response.json();
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
  try {
    return { ok: true, ...JSON.parse(clean) };
  } catch (err) {
    // Shaped failure: treat all leftovers as needs_review new-items rather than throw.
    return {
      ok: false,
      matches: leftovers.map(l => ({
        raw_text: l.raw_text, catalog_item_id: null,
        match_confidence: 0, is_new_item: true,
        suggested_name: l.parsed_name, suggested_category: null
      }))
    };
  }
}
```

## Orchestration — tie tiers to the review gate

```js
const REVIEW_THRESHOLD = 0.80;   // matches SPEC_receipt_import gate

export async function reconcileReceipt(lines, catalog) {
  const { matched, leftovers } = tier1Reconcile(lines, catalog);
  const { matches } = await tier2Reconcile(leftovers, catalog);

  // Fold Tier 2 results back, aligned by raw_text, and set review status.
  const tier2 = matches.map(m => {
    const line = leftovers.find(l => l.raw_text === m.raw_text) || {};
    const needsReview = m.is_new_item || m.match_confidence <= REVIEW_THRESHOLD;
    return {
      ...line,
      catalog_item_id: m.catalog_item_id,
      match_confidence: m.match_confidence,
      match_source: "ai",
      status: needsReview ? "needs_review" : "auto",
      is_new_item: m.is_new_item,
      suggested_name: m.suggested_name,
      suggested_category: m.suggested_category
    };
  });

  // Tier 1 matches are all above 0.85 → auto. Tier 2 splits by the gate.
  return [...matched, ...tier2];
}
```

---

## Learning notes

- **Normalize before you compare, always.** Almost every "matching" problem in
  software is really a normalization problem. The comparison is easy once both
  sides are in the same shape.
- **Threshold conservatively on the free tier.** Tier 1 should only auto-match
  when sure; doubt is cheap to resolve at Tier 2 but expensive to undo once
  silently committed to the catalog and price history.
- **Align AI results by a stable key** (`raw_text`), never by array position —
  the model may reorder or drop items.

## Done when
- Repeat items (seed catalog) match at Tier 1 with no API call.
- Only unmatched lines reach Tier 2; empty leftovers = zero calls.
- Genuinely new products come back `is_new_item=true`, not force-matched.
- Everything ≤ 0.80 lands in the review pile; everything above auto-commits.
- Tier 2 failure degrades to needs_review new-items, never an unhandled throw.

## Watch-outs
- **Tune `TIER1_THRESHOLD` against real receipts**, not synthetic ones. 0.85 is a
  starting guess; watch for false auto-matches (two similar staples) and raise if
  needed.
- Jaccard is deliberately simple. If it under-performs on real abbreviations,
  the upgrade path is a fuzzy distance (e.g. token-sort ratio) — but only after
  real data shows the need. KISS until it complains.
- This whole stage is Phase 3 landing during Phase 1 — deliberate reach-forward,
  flagged so it's not silent drift.
