# SPEC — Receipt Vision Extraction (the photo → JSON call)

**Scope:** OurProvisions · Phase 3 · first build artifact of receipt import
**Status:** Design settled, ready for BUILD
**Depends on:** SPEC_receipt_import.md (this is step 1 of that pipeline)

---

## What this is

The **capture** stage only: photo → strict JSON. This is the single call the whole
feature rests on. It does OCR + extraction together (Claude vision needs no separate
OCR service). It does NOT match against your catalog — that's Tier 1/2 reconcile,
a later call. This call only answers: **"What does this receipt physically say, and
how sure are you of each part?"**

## The one distinction that matters most

Two different confidences live in this feature. Keep them apart:

| confidence | question | lives where |
|---|---|---|
| `price_confidence` (this call) | "How sure am I this line reads $5.99?" | extraction |
| `match_confidence` (later) | "How sure am I this maps to Spring Mix in the catalog?" | reconcile |

Conflating them produces a system that's confidently wrong. This call scores only
readability, never catalog mapping.

---

## System prompt (verbatim)

```
You are a receipt extraction engine. You receive a photo of a grocery or retail
receipt and return ONLY a single JSON object — no prose, no markdown, no code
fences, nothing before or after the JSON.

Your job is to report what the receipt physically says, not to interpret what the
items map to. Be honest about uncertainty. A null you are sure of is worth more
than a guess you are not.

Return this exact shape:

{
  "store_name": string | null,
  "purchased_at": string | null,   // ISO 8601 date if legible, else null
  "currency": string | null,       // e.g. "USD", infer from symbols/locale
  "subtotal": number | null,
  "tax": number | null,
  "total": number | null,
  "lines": [
    {
      "raw_text": string,          // EXACTLY as printed, abbreviations intact.
                                   // Never clean or expand this field.
      "parsed_name": string | null,// your best plain-English name for the item,
                                   // or null if you cannot tell what it is
      "quantity": number | null,
      "unit": string | null,       // "each","lb","kg","oz","gal", etc. if shown
      "price": number | null,      // the line's total price as printed
      "price_confidence": number,  // 0.0–1.0, how sure you are of the PRICE digits
      "needs_attention": boolean   // true if the line is smudged, ambiguous,
                                   // a non-item (fees, deposits, discounts), or
                                   // you are otherwise unsure it is a real product
    }
  ],
  "warnings": [ string ],          // human-readable problems: cut off, faded,
                                   // thumb over total, multiple receipts, etc.
  "totals_reconcile": boolean      // true if the sum of line prices is within a
                                   // few cents of `total`; false if they diverge
}

Rules:
- raw_text is sacred: copy the printed characters, do not normalize or expand them.
- Never invent a number you cannot read. Use null and add a warning.
- Discounts, coupons, bag fees, bottle deposits, loyalty lines: include them as
  lines with needs_attention=true so a human decides, do not silently fold them
  into item prices.
- If the image contains no readable receipt, return all-null fields, empty lines,
  and a warning explaining why.
- Output JSON only. No ```json fence. No commentary.
```

## Why each rule earns its place

- **"JSON only, no fence"** — your parser shouldn't have to strip markdown. (You
  still strip defensively — models drift — but you don't design *for* the fence.)
- **`raw_text` is sacred** — this is your audit anchor and future alias training
  data. If the model expands "GV WHL MLK 1G" here, that history is corrupted.
- **`needs_attention` on non-items** — coupons/deposits/fees are the classic way a
  naive extractor pollutes your catalog with "$-2.00 STORE COUPON" as a product.
  Flagging routes them to the human instead of into `price_hint`.
- **`totals_reconcile`** — cheap missed-line detector. If the printed total is
  $58.14 but the lines sum to $52.15, a line got dropped or misread. Surface it.
- **Structured refusal** — a confident fabricated price silently poisons a budget.
  `null` + warning is always the safer failure.

---

## The call (React, your stack)

In-app it runs through the API-in-artifacts pattern (`api.anthropic.com/v1/messages`,
no key passed). Model: use the current Sonnet vision model string at build time
(cheaper than Opus and ample for OCR+extract; confirm the exact string from
product docs when wiring). Image goes as a base64 `image` content block.

```js
// receiptExtract.js — capture stage of the receipt pipeline
// Teaching notes inline; Dan is learning this integration pattern.

async function extractReceipt(base64Image, mediaType /* "image/jpeg" | "image/png" */) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",   // vision-capable; confirm current string at build
      max_tokens: 1500,             // receipts are long-ish; headroom for many lines
      system: SYSTEM_PROMPT,        // the verbatim block above
      messages: [
        {
          role: "user",
          content: [
            { type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Image } },
            { type: "text",
              text: "Extract this receipt as the specified JSON object." }
          ]
        }
      ]
    })
  });

  const data = await response.json();

  // WHY assemble text this way: content is an array of blocks. Never assume
  // content[0] is your text — find the text block(s) explicitly.
  const rawText = data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  // WHY strip fences even though we forbade them: models occasionally add them
  // anyway. Cheap insurance; costs nothing when they behave.
  const clean = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

  // WHY try/catch: a malformed extraction must fail loudly to the UI, not throw
  // an unhandled error mid-commit. Return a shaped failure the review screen
  // can render.
  try {
    const parsed = JSON.parse(clean);
    return { ok: true, receipt: parsed };
  } catch (err) {
    return {
      ok: false,
      error: "Could not read that receipt. Try a flatter, brighter photo.",
      raw: clean            // keep for debugging; never show to user
    };
  }
}
```

## Two learning notes (React / AI integration)

1. **The content array is not a string.** Every Claude API response is a list of
   typed blocks. Filtering by `type` (not indexing by position) is the habit that
   keeps this robust when tool use or multiple blocks appear later. Same pattern
   you'll reuse for every AI call in the app.
2. **Shape your failures.** `{ ok: true/false }` return objects mean the review
   screen has one predictable thing to branch on. This is the small discipline
   that keeps AI features from throwing raw exceptions into your UI.

---

## Done when
- A real photographed receipt returns valid JSON matching the contract.
- Smudged/ambiguous lines come back with low `price_confidence` and
  `needs_attention=true` — NOT confident guesses.
- A coupon/deposit line is flagged, not folded into an item price.
- `totals_reconcile=false` when a line is deliberately obscured.
- Bad image returns the shaped failure, no unhandled throw.

## Watch-outs
- **Test on a real, crumpled, thermal-paper receipt first — before any DB work.**
  If extraction is shaky on real input, the whole pipeline's assumptions shift.
  This artifact is deliberately the first build step for exactly that reason.
- Confirm the current vision model string from product docs at build time; the
  one above may have advanced.
- Watch honest-confidence behavior: feed it one genuinely ambiguous line and
  confirm the score actually drops. If it always returns high, the downstream
  gate is theater and the prompt needs tightening.
- Phase note: this is Phase 3 work landing during active Phase 1 — a deliberate
  reach-forward prototype, flagged so it's not silent roadmap drift.
