# Velayo Welcome Email

Status: FINAL (v17) — 2026-07-21
Type: Automated welcome, sent on Mailchimp signup
Sends from / feedback to: thoughts@velayo.ai (soft "reply to us" only here)
CTA target: https://ourprovisions.app (the toll / landing page — the verified path)

---

**Subject:** We're glad we found each other

**Preview text:** Technology that gives you time back.

---

Hi *|FNAME|* —

Thanks for joining us — we're really glad you're here.

At Velayo, we believe technology should make people healthier, happier, and
kinder to the Earth.

We pursue that in an unlikely way — by building small, beautiful apps that
remove the little daily frictions that quietly steal your time, energy, and
peace. They use AI, but the technology is never the point. No grand disruption.
Just useful, joyful tools that make today a little better, for you and for the
extraordinary planet we share.

We're not trying to keep you on your screen. The best thing our apps can do is
give you a few minutes back and let you get on with your life.

Two ideas sit underneath everything we make.

The first is about the world: you can't stop the tide, but you can bend down and
throw back one starfish at a time — a little more comfort, a little less
suffering. That's enough.

The second is about you: you can't pour goodness into the world while running on
empty. So we build for both — lifting the small frictions that wear you down,
and giving you back something real to spend on the people and places you love.

The first of our apps is already here. It's called **OurProvisions** — a shared
grocery list that learns how your household shops, becoming more helpful over
time. It's still early, and we're building it alongside the people who use it —
so come aboard, take a look, and tell us what you think. Your thoughts genuinely
shape what we make next.

[**Come aboard →**](https://ourprovisions.app)

OurProvisions is just the beginning. Every app we build will lift another small
friction from everyday life. Alone, they'll save you moments. Together, they'll
give you back more of what matters most: your time.

We're just getting started, and we love having you on the journey!

— The Velayo Team

---

## Build notes (Mailchimp)

- FNAME fallback: use the conditional merge so no-name signups don't get
  "Hi  —". Pattern:
  `*|IF:FNAME|*Hi *|FNAME|* —*|ELSE:|*Hi there —*|END:IF|*`
- "Come aboard →" is a BUTTON, linked to https://ourprovisions.app
- Bold: "OurProvisions" (first mention) and the button label
- Subject + preview text are set at the email/automation level, not in the
  body — update those fields separately.
- Edit the EXISTING welcome automation's email step (don't build a new one, or
  two welcomes may fire). Changes apply to signups entering after save.
- No product-specific "rough edges" caveat here — intentional; this is the
  company welcome, not the OurProvisions welcome.

## Change log
- v17 (2026-07-21): Opener reframed from "success means one thing: proving
  technology can..." to "we believe technology should..." (conviction over
  something-to-prove). Bridge line "We do it..." -> "We pursue that..." to
  connect belief to action cleanly.
