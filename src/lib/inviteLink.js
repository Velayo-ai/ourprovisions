// The invite's three client edges (SPEC_durable_invite_hold, 2026-11-08).
// The code never enters telemetry; these helpers keep that true by shape.

// A4: the welcome sheet takes a pasted invite LINK or a bare code. The one thing
// a real invitee can get at is the link (iMessage shows only the domain), so a
// URL's ?invite= wins; a scheme-less paste ("ourprovisions.velayo.ai/?invite=X")
// is read the same way; anything else is taken as typed — the server says
// "Invite not found." when it isn't one.
export function inviteCodeFromInput(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  try {
    const code = new URL(trimmed).searchParams.get("invite");
    if (code) return code.trim();
  } catch (e) { /* not a full URL */ }
  const m = /[?&]invite=([^&#\s]+)/i.exec(trimmed);
  if (m) {
    try { return decodeURIComponent(m[1]).trim(); } catch (e) { return m[1].trim(); }
  }
  return trimmed;
}

// A5: the share text names the code, so an invitee whose link doesn't open the
// app can still type it. `url` is createInvite's `${origin}?invite=CODE`; the link
// itself still rides the share's `url` field, never this text.
export function inviteShareText(name, url) {
  let code = null;
  try { code = new URL(url).searchParams.get("invite"); } catch (e) { code = null; }
  const base = `Come aboard my OurProvisions list — join ${name}.`;
  return code ? `${base} Code ${code} if the link doesn't open the app.` : base;
}

// A6: invite_consumed, booleans and a fixed outcome word only — never the code.
//   absent  — bootstrap found no live held code (none, or expired and cleared)
//   joined  — the code joined (bootstrap, or join_household's second look)
//   failed  — a code was present and did not join
export function inviteConsumedAttributes(present, joined) {
  return { present: !!present, outcome: !present ? "absent" : joined ? "joined" : "failed" };
}
