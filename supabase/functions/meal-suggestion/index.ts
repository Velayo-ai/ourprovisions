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
      name: { type: "string", minLength: 1, description: "Meal name, title case, no article." },
      baseServings: { type: "integer", minimum: 1, description: "Whole number of servings." },
      instructions: {
        type: "string",
        minLength: 1,
        description: "Plain numbered cooking steps, '1. ...\\n2. ...'. No markdown.",
      },
      ingredients: {
        type: "array",
        minItems: 1,
        description: "Everything to shop for. Reuse catalog names verbatim where they fit.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            quantity: { type: "number", exclusiveMinimum: 0 },
            unit: { type: "string", enum: [...ALLOWED_UNITS] },
          },
          required: ["name", "quantity", "unit"],
          additionalProperties: false,
        },
      },
    },
    required: ["name", "baseServings", "instructions", "ingredients"],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Caller verification
// ---------------------------------------------------------------------------
// SIGNATURE is verified by the platform, not here. Supabase's `verify_jwt` gate runs
// before this code and rejects anything not signed with the project JWT secret. These
// tokens are Clerk JWT-template tokens ("supabase" template, see
// src/lib/supabaseClient.js) — Clerk signs them with that same shared secret, which is
// why the platform gate accepts them natively and no Clerk JWKS fetch is needed.
//
// ⚠️ DO NOT DEPLOY WITH --no-verify-jwt. The claim checks below are NOT a signature
// check; without the platform gate in front of them, every one of them is forgeable.
//
// WHY CLAIM CHECKS ARE STILL REQUIRED: `verify_jwt` accepts ANY token signed with the
// project secret — and the anon key is exactly that. It is a valid JWT, and it ships
// inside the public client bundle. So the platform gate alone would let anyone who
// views source spend Anthropic credit, which is the one thing this gate exists to
// stop. Requiring a real end-user token (`role` = authenticated, `sub` present) is
// what actually closes that hole.
function verifyCaller(req: Request): { ok: true; sub: string } | { ok: false; reason: string } {
  const header = req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, reason: "Missing Bearer token" };

  const parts = match[1].split(".");
  if (parts.length !== 3) return { ok: false, reason: "Malformed JWT" };

  let claims: Record<string, unknown>;
  try {
    // base64url -> JSON. Deno's atob needs standard base64 and no padding gaps.
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    claims = JSON.parse(atob(padded));
  } catch {
    return { ok: false, reason: "Unreadable JWT payload" };
  }

  const exp = claims.exp;
  if (typeof exp !== "number" || exp * 1000 <= Date.now()) {
    return { ok: false, reason: "Token expired" };
  }

  // The anon key carries role "anon" and no sub. Both checks matter independently.
  if (claims.role === "anon" || claims.role === "service_role") {
    return { ok: false, reason: "Not an end-user token" };
  }
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

  const caller = verifyCaller(req);
  if (!caller.ok) return json({ error: `Unauthorized: ${caller.reason}` }, 401);

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
  const rawCatalog = Array.isArray(body.catalog) ? body.catalog : [];
  const catalog = rawCatalog
    .slice(0, MAX_CATALOG_ITEMS)
    .map((row) => {
      const item = row as { name?: unknown; category?: unknown };
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const category = typeof item.category === "string" ? item.category.trim() : "";
      return name ? (category ? `${name} (${category})` : name) : "";
    })
    .filter(Boolean);

  const catalogBlock = catalog.length
    ? `The household's current catalog — reuse these names verbatim wherever one fits:\n${catalog.join("\n")}`
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

  console.log(
    `meal-suggestion ok sub=${caller.sub} catalog=${catalog.length} ` +
      `in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
  );

  return json(draft);
});
