// supabase/functions/meal-suggestion/index.ts
//
// OurProvisions — AI meal suggestion proxy. The project's FIRST Edge Function.
// Spec: docs/specs/active/SPEC_ai_meal_suggestion.md
//
// WHY THIS EXISTS: to keep ANTHROPIC_API_KEY off the client. An Anthropic key in
// browser JS is readable by anyone who opens devtools. Nothing else about this
// function is load-bearing — it holds no state and reads no database.
//
// STATELESS BY DESIGN (decided 2026-09-01): the client passes the catalog context in
// the request payload. This function uses NO service-role key and performs NO database
// reads, so it cannot be turned into a data-exfiltration path by a forged household id
// — it can only ever see what the caller already had.
//
// AUTH IS COST CONTROL, NOT DATA PROTECTION. There is no household data here to
// protect; the gate exists so that anonymous traffic cannot spend Anthropic credit.
// See verifyCaller() for why the platform's JWT gate alone is NOT sufficient for that.

import Anthropic from "npm:@anthropic-ai/sdk@0.123.0";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "npm:jose@6.2.10";
import { ALLOWED_UNITS, SYSTEM_PROMPT } from "./prompt.ts";

// ---------------------------------------------------------------------------
// Limits — cost control, since nothing else rate-limits this yet (spec: open item)
// ---------------------------------------------------------------------------
const MAX_REQUEST_CHARS = 600;   // a spoken craving; anything longer is not a craving
const MAX_CATALOG_ITEMS = 400;   // bounds prompt size; households are far smaller
const MAX_TOKENS = 4000;         // one meal never needs more

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// The one tool. `strict: true` guarantees the input validates this schema exactly,
// so the single-meal rule is enforced STRUCTURALLY (an object, never an array) as
// well as in the prompt. Two independent guarantees, because the prompt alone is a
// request and the schema alone cannot express "pick the best one".
//
// ⚠️ NO VALUE-CONSTRAINT KEYWORDS HERE — learned the hard way 2026-09-01. A strict
// tool schema accepts only a STRUCTURAL subset of JSON Schema. `minimum` on an
// integer is rejected outright:
//   400 invalid_request_error
//   "tools.0.custom: For 'integer' type, property 'minimum' is not supported"
// `minLength`, `minItems` and `exclusiveMinimum` are the same class of keyword, and
// the API reports only the FIRST violation it hits — so removing them one at a time
// costs a full deploy-and-test cycle each. They are all gone.
//
// What survives: type, properties, required, additionalProperties, enum, description.
// The value constraints moved to `validateDraft()` below, which is the better home
// anyway — it fails loudly on a real violation instead of trusting the model to have
// honoured a keyword the API silently never enforced.
// ---------------------------------------------------------------------------
const EMIT_MEAL_TOOL = {
  name: "emit_meal",
  description:
    "Emit the single suggested meal. Call this exactly once. There is no way to " +
    "emit more than one meal, by design — for a plural request, pick the best fit.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "Meal name, title case, no article. Never empty." },
      baseServings: {
        type: "integer",
        description: "Whole number of servings, 1 or greater. Default 4 if unstated.",
      },
      instructions: {
        type: "string",
        description:
          "Plain numbered cooking steps separated by REAL newline characters, never the " +
          "literal two-character sequence backslash-n. No markdown. Never empty.",
      },
      ingredients: {
        type: "array",
        description:
          "Everything to shop for; at least one item. Reuse catalog names verbatim where they fit.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Ingredient name. Never empty." },
            // `integer` is a TYPE, not a value constraint, so strict mode accepts it —
            // unlike `minimum`. First line of defence for the whole-number rule;
            // validateAndNormalizeDraft's Math.ceil is the guarantee behind it.
            quantity: {
              type: "integer",
              description: "Whole number of units to buy, 1 or greater. Round UP, never down.",
            },
            unit: { type: "string", enum: [...ALLOWED_UNITS] },
            // Only used when the ingredient is NOT already in the catalog: it becomes
            // the new custom item's category. Without it every AI-created item lands in
            // "Household" (createCatalogItem's default), which files Cumin next to bin
            // bags. Matched items keep their existing category and ignore this.
            category: {
              type: "string",
              description:
                "Grocery category for this ingredient. Reuse one of the categories " +
                "shown in the household's catalog listing whenever one fits.",
            },
          },
          required: ["name", "quantity", "unit", "category"],
          additionalProperties: false,
        },
      },
    },
    required: ["name", "baseServings", "instructions", "ingredients"],
    additionalProperties: false,
  },
};

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Validate the draft, then make it TRUE — i.e. make what the client displays match
 * what will actually be saved. Returns a reason string when unusable, or null when good.
 * Mutates `d.instructions` and `d.ingredients` in place for the normalisations below.
 *
 * This is the "fail loudly" half of the spec: a malformed draft surfaces as an error
 * rather than being quietly half-saved. The three repairs it DOES make are deterministic
 * corrections with exactly one right answer, not guesses at intent:
 *
 * 0. LITERAL BACKSLASH-N BECOMES A REAL NEWLINE. Seen on the 2026-09-01 verification
 *    walk: one draft rendered "…\\n5. Serve" as visible junk mid-recipe. The prompt asks
 *    for real line breaks and the client normalises too — this is the middle guarantee,
 *    so a future consumer that skips the hook still gets clean steps.
 *
 * 1. QUANTITIES ARE ROUNDED UP TO WHOLE NUMBERS. The app's stepper only holds whole
 *    numbers (App.js setQty = Math.max(1, n ± 1), no text entry), and
 *    meal_ingredients.quantity_per_serving is unconstrained `numeric` — so a 1.5 would
 *    be the first fraction in the system and would render as "1.5", stepping to "2.5".
 *    Up, never down: too much of an ingredient is an annoyance, too little is a ruined
 *    dinner. The prompt asks for this too; this is the guarantee.
 *
 * 2. UNITS ARE FORCED TO WHAT WILL ACTUALLY PERSIST. `meal_ingredients` has no unit
 *    column at all — unit lives only on `catalog_items`. A matched item therefore keeps
 *    its existing catalog unit no matter what the model says, and an unmatched item gets
 *    `catalog_items.unit`'s default 'each', because insert_custom_catalog_item takes only
 *    (p_name, p_category, p_household_id, p_created_by) — there is no unit parameter to
 *    pass one through. Left alone, the draft would show the person "lb" and then save
 *    "each". Overwriting here is what stops the UI from lying.
 *    ⚠️ FOLLOW-UP: giving new custom items a real unit needs a migration to add a unit
 *    param to that RPC. Until then the model's unit for an unmatched item is discarded.
 */
function validateAndNormalizeDraft(
  d: Record<string, unknown>,
  catalogUnits: Map<string, string>,
): string | null {
  const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

  if (!nonEmpty(d.name)) return "name is empty";
  if (!nonEmpty(d.instructions)) return "instructions are empty";
  // Literal backslash-n -> real newlines. Seen on the 2026-09-01 walk: one draft
  // rendered "...\\n5. Serve" as visible junk mid-recipe. The client normalises too;
  // doing it here as well means any future consumer gets it right for free.
  d.instructions = (d.instructions as string)
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .trim();
  if (typeof d.baseServings !== "number" || !Number.isInteger(d.baseServings) || d.baseServings < 1) {
    return `baseServings must be a whole number >= 1, got ${JSON.stringify(d.baseServings)}`;
  }
  if (!Array.isArray(d.ingredients) || d.ingredients.length === 0) {
    return "ingredients must be a non-empty list";
  }
  for (const [i, raw] of d.ingredients.entries()) {
    if (typeof raw !== "object" || raw === null) return `ingredient ${i} is not an object`;
    const ing = raw as Record<string, unknown>;
    if (!nonEmpty(ing.name)) return `ingredient ${i} has an empty name`;
    if (typeof ing.quantity !== "number" || !Number.isFinite(ing.quantity) || ing.quantity <= 0) {
      return `ingredient ${i} (${String(ing.name)}) has quantity ${JSON.stringify(ing.quantity)}`;
    }
    if (!ALLOWED_UNITS.includes(ing.unit as typeof ALLOWED_UNITS[number])) {
      return `ingredient ${i} (${String(ing.name)}) has unit ${JSON.stringify(ing.unit)}`;
    }

    const rounded = Math.ceil(ing.quantity);
    if (rounded !== ing.quantity) {
      console.log(`normalised quantity ${ing.quantity} -> ${rounded} for ${String(ing.name)}`);
    }
    ing.quantity = rounded;

    const catalogUnit = catalogUnits.get(normName(ing.name as string));
    const effective = catalogUnit ?? "each";
    if (effective !== ing.unit) {
      console.log(
        `normalised unit ${JSON.stringify(ing.unit)} -> ${JSON.stringify(effective)} for ` +
          `${String(ing.name)} (${catalogUnit ? "catalog item" : "new custom item, RPC has no unit param"})`,
      );
      ing.unit = effective;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Caller verification — THIS FUNCTION DOES THE SIGNATURE CHECK ITSELF
// ---------------------------------------------------------------------------
// ⚠️ CORRECTED 2026-09-01, and the correction matters. This function was first written
// assuming these were HS256 tokens signed with the shared Supabase JWT secret (the old
// Clerk "supabase" JWT-template integration), so that Supabase's platform `verify_jwt`
// gate would validate them and this code need only check claims. THAT IS WRONG.
//
// A real token from `getToken({ template: "supabase" })` on dev is **RS256, signed by
// Clerk**, with `iss: https://<instance>.clerk.accounts.dev` and a `kid`. Postgres
// accepts it (Supabase third-party auth validates it against Clerk's JWKS), but the
// **Edge Functions gateway does not** — it rejected a live, unexpired token with
// `UNAUTHORIZED_ASYMMETRIC_JWT`. Proven by test, not assumed: the token still had 9
// seconds of life when the gateway refused it.
//
// So this function is deployed with `verify_jwt: false` and verifies the token itself,
// against Clerk's JWKS. That is not a weakening — it is strictly more verification
// than before, and it no longer depends on a platform gate whose semantics were guessed.
//
// ⚠️ BECAUSE THERE IS NO PLATFORM GATE IN FRONT, EVERY CHECK BELOW IS LOad-BEARING.
// `jwtVerify` pinned to RS256 against a trusted issuer's JWKS is the whole security
// boundary. Do not "simplify" it to a decode-and-check-claims — that would accept any
// token anyone typed. The `algorithms` pin also single-handedly rejects the Supabase
// anon key, which is HS256.

// Issuer allowlist. The token's own `iss` cannot be trusted to name its own JWKS —
// that would let anyone point us at a JWKS they control. Set CLERK_ISSUER (comma
// separated) to override; the default is the dev Clerk instance, which is public
// information (it appears in every token and in the client bundle).
// ⚠️ PROD MUST SET CLERK_ISSUER — the prod Clerk instance is a different issuer, and
// this default would reject every prod token.
const ALLOWED_ISSUERS = (Deno.env.get("CLERK_ISSUER") ??
  "https://many-puma-34.clerk.accounts.dev")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// jose caches fetched keys internally, so this is one JWKS fetch per issuer per cold
// start, not one per request.
const JWKS_BY_ISSUER = new Map(
  ALLOWED_ISSUERS.map((iss) => [
    iss,
    createRemoteJWKSet(new URL(`${iss.replace(/\/$/, "")}/.well-known/jwks.json`)),
  ]),
);

async function verifyCaller(
  req: Request,
): Promise<{ ok: true; sub: string } | { ok: false; reason: string }> {
  const header = req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, reason: "Missing Bearer token" };
  const token = match[1].trim();

  // Read `iss` unverified ONLY to select which trusted JWKS to check against. The
  // choice is constrained to the allowlist, so a forged `iss` selects nothing.
  let unverifiedIss: string | undefined;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, reason: "Malformed JWT" };
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    unverifiedIss = typeof payload.iss === "string" ? payload.iss : undefined;
  } catch {
    return { ok: false, reason: "Unreadable JWT payload" };
  }

  const jwks = unverifiedIss ? JWKS_BY_ISSUER.get(unverifiedIss) : undefined;
  if (!jwks || !unverifiedIss) return { ok: false, reason: "Untrusted issuer" };

  let claims: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, jwks, {
      issuer: unverifiedIss, // re-checked against the verified payload by jose
      algorithms: ["RS256"], // pins out HS256 — this is what rejects the anon key
    });
    claims = verified.payload as Record<string, unknown>;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) return { ok: false, reason: "Token expired" };
    if (err instanceof joseErrors.JWTClaimValidationFailed) {
      return { ok: false, reason: "Token claims rejected" };
    }
    if (err instanceof joseErrors.JOSEAlgNotAllowed) {
      return { ok: false, reason: "Unsupported token algorithm" };
    }
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
      return { ok: false, reason: "Bad signature" };
    }
    console.error("jwt verification error", err);
    return { ok: false, reason: "Token could not be verified" };
  }

  // Claim checks on top of the signature: a correctly signed token still must be a
  // real end user, not a machine identity.
  if (claims.role !== "authenticated") return { ok: false, reason: "Not an end-user token" };
  const sub = claims.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    return { ok: false, reason: "Not an end-user token" };
  }

  return { ok: true, sub };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const caller = await verifyCaller(req);
  if (!caller.ok) {
    // The reason travels in the response body, which the logs never see — so a rejection
    // reads as a bare 401 in `function_edge_logs` and the actual cause is unrecoverable
    // after the fact. Cost a full forensics pass on 2026-09-02. Logged here, at the ONE
    // place every verifyCaller failure funnels through, rather than at each return.
    console.warn(`meal-suggestion 401: ${caller.reason}`);
    return json({ error: `Unauthorized: ${caller.reason}` }, 401);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set on this function");
    return json({ error: "Server misconfigured" }, 500);
  }

  let body: { requestText?: unknown; catalog?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const requestText = typeof body.requestText === "string" ? body.requestText.trim() : "";
  if (!requestText) return json({ error: "requestText is required" }, 400);
  if (requestText.length > MAX_REQUEST_CHARS) {
    return json({ error: `requestText must be ${MAX_REQUEST_CHARS} characters or fewer` }, 400);
  }

  // Catalog context is optional — a brand-new household legitimately has none.
  // The catalog carries units as well as names, because the model must reuse an
  // existing item's established unit rather than inventing a competing one.
  const rawCatalog = Array.isArray(body.catalog) ? body.catalog : [];
  const catalogUnits = new Map<string, string>();
  const catalog = rawCatalog
    .slice(0, MAX_CATALOG_ITEMS)
    .map((row) => {
      const item = row as { name?: unknown; category?: unknown; unit?: unknown };
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!name) return "";
      const category = typeof item.category === "string" ? item.category.trim() : "";
      const unit = typeof item.unit === "string" && item.unit.trim() ? item.unit.trim() : "each";
      catalogUnits.set(normName(name), unit);
      const meta = [category, unit].filter(Boolean).join(", ");
      return meta ? `${name} (${meta})` : name;
    })
    .filter(Boolean);

  const catalogBlock = catalog.length
    ? `The household's current catalog, as "Name (category, unit)" — reuse these names ` +
      `verbatim wherever one fits, and use the item's stated unit exactly:\n${catalog.join("\n")}`
    : `This household's catalog is empty. Name every ingredient plainly and generically.`;

  const client = new Anthropic({ apiKey });

  let response;
  try {
    response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: MAX_TOKENS,
      output_config: { effort: "low" }, // single-shot extraction; depth buys nothing here
      system: SYSTEM_PROMPT,
      tools: [EMIT_MEAL_TOOL],
      messages: [
        {
          role: "user",
          content: `${catalogBlock}\n\nThe request:\n${requestText}`,
        },
      ],
    });
  } catch (err) {
    // Typed SDK errors, most specific first. Status is what the client needs to
    // distinguish "try again" from "this will never work".
    if (err instanceof Anthropic.RateLimitError) {
      console.error("anthropic rate limited", err.message);
      return json({ error: "The suggestion service is busy. Try again in a moment." }, 429);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("anthropic auth failed — check the ANTHROPIC_API_KEY secret");
      return json({ error: "Server misconfigured" }, 500);
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`anthropic APIError ${err.status}`, err.message);
      return json({ error: "Could not reach the suggestion service." }, 502);
    }
    console.error("unexpected error calling anthropic", err);
    return json({ error: "Could not reach the suggestion service." }, 502);
  }

  // A refusal is a 200 with stop_reason "refusal" — check before reading content.
  if (response.stop_reason === "refusal") {
    console.error("anthropic refused", response.stop_details);
    return json({ error: "That request could not be turned into a meal." }, 422);
  }

  const toolUse = response.content.find(
    (block) => block.type === "tool_use" && block.name === "emit_meal",
  );

  // FAIL LOUDLY — the spec is explicit that a malformed answer must surface as an
  // error, never be silently repaired. If the model answered in text instead of
  // calling the tool, that is a broken response, not a draft.
  if (!toolUse || toolUse.type !== "tool_use") {
    console.error("no emit_meal tool_use block", JSON.stringify(response.content).slice(0, 800));
    return json({ error: "The suggestion service returned an unusable response." }, 502);
  }

  const draft = toolUse.input;

  // Explicit array guard. `strict: true` already makes this unreachable, and that is
  // the point of writing it down: if it ever fires, the schema contract broke, and we
  // must NOT quietly take the first element and hide the mismatch (spec, verbatim).
  if (Array.isArray(draft) || typeof draft !== "object" || draft === null) {
    console.error("emit_meal input was not a single object", JSON.stringify(draft).slice(0, 800));
    return json({ error: "The suggestion service returned more than one meal." }, 502);
  }

  const invalid = validateAndNormalizeDraft(draft as Record<string, unknown>, catalogUnits);
  if (invalid) {
    console.error("emit_meal draft failed validation:", invalid, JSON.stringify(draft).slice(0, 800));
    return json({ error: "The suggestion service returned an unusable meal." }, 502);
  }

  console.log(
    `meal-suggestion ok sub=${caller.sub} catalog=${catalog.length} ` +
      `in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
  );

  return json(draft);
});
