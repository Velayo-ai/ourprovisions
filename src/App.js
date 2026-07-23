import { SignInButton, SignUpButton, useUser, useAuth, useClerk } from '@clerk/clerk-react';
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useProvisions } from './hooks/useProvisions';
import { ActiveHouseholdProvider, useActiveHousehold } from './contexts/ActiveHouseholdContext';
import { ConnectivityProvider } from './contexts/ConnectivityContext';
import { ConnectivityPill } from './components/ConnectivityPill';

// Maps Supabase category names → display names with emoji
const CATEGORY_DISPLAY = {
  "Produce": "🥦 Produce",
  "Meat & Seafood": "🥩 Meat & Seafood",
  "Dairy": "🥛 Dairy",
  "Pantry": "🥫 Pantry",
  "Beverages": "🧃 Beverages",
  "Household": "🧹 Household",
  "Bakery": "🍞 Bakery & Bread",
};

// Preferred sort order for categories
const CATEGORY_ORDER = [
  "Produce", "Meat & Seafood", "Dairy", "Pantry", "Beverages", "Household", "Bakery"
];

const SWIPE_THRESHOLD = 60;

// Device-local list text-size steps. Index (0–4) is persisted; scale drives --op-list-scale.
const TEXT_STEPS = [0.9, 1.0, 1.2, 1.45, 1.75];
const TEXT_LABELS = ["Compact", "Default", "Large", "XL", "XXL"];

function SwipeToRemove({ onRemove, onEdit, onStaple, isStaple, canEdit = true, removeLabel = "Hide", style: outerStyle, children }) {
  const REVEAL_WIDTH = 240;
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [removing, setRemoving] = useState(false);
  const startX = useRef(null);
  const startY = useRef(null);
  const isHoriz = useRef(false);
  const baseOffset = useRef(0);

  const handleStart = (clientX, clientY) => {
    startX.current = clientX;
    startY.current = clientY;
    isHoriz.current = false;
    baseOffset.current = offsetX;
    setSwiping(true);
  };

  const handleMove = (clientX, clientY) => {
    if (startX.current === null) return;
    const dx = clientX - startX.current;
    const dy = clientY - startY.current;
    if (!isHoriz.current) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      isHoriz.current = Math.abs(dx) > Math.abs(dy);
    }
    if (!isHoriz.current) return;
    if (onEdit) {
      setOffsetX(Math.min(0, Math.max(baseOffset.current + dx, -REVEAL_WIDTH)));
    } else {
      if (dx < 0) setOffsetX(Math.max(dx, -120));
    }
  };

  const handleEnd = () => {
    startX.current = null;
    setSwiping(false);
    if (onEdit) {
      const delta = offsetX - baseOffset.current; // + = dragged right, - = dragged left
      const startedOpen = baseOffset.current <= -REVEAL_WIDTH / 2;
      if (startedOpen) {
        // open row: a right drag past threshold closes; otherwise stay open
        if (delta > SWIPE_THRESHOLD) setOffsetX(0);
        else setOffsetX(-REVEAL_WIDTH);
      } else {
        // closed row: a left drag past threshold opens; otherwise stay closed
        if (delta < -SWIPE_THRESHOLD) setOffsetX(-REVEAL_WIDTH);
        else setOffsetX(0);
      }
    } else {
      if (offsetX < -SWIPE_THRESHOLD) {
        setRemoving(true);
        setOffsetX(-400);
        setTimeout(() => {
          onRemove();
          setRemoving(false);
          setOffsetX(0);
        }, 400);
      } else {
        setOffsetX(0);
      }
    }
  };

  const close = () => setOffsetX(0);

  const handleRemove = () => {
    setRemoving(true);
    setOffsetX(-400);
    setTimeout(() => { onRemove(); setRemoving(false); setOffsetX(0); }, 400);
  };

  const isRevealing = offsetX < -10;

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: "8px", marginBottom: "0", ...outerStyle }}>
      {onEdit ? (
        <div style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: `${REVEAL_WIDTH}px`,
          display: "flex", opacity: isRevealing ? 1 : 0, transition: "opacity 0.15s",
          pointerEvents: offsetX === 0 ? "none" : "auto"
        }}>
          {canEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); close(); onEdit(); }}
              style={{
                flex: 1, background: "#c8973a", border: "none", color: "white",
                fontFamily: "'Lato', sans-serif", fontSize: "0.8rem", fontWeight: 700,
                letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer"
              }}
            >Edit</button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); close(); onStaple && onStaple(); }}
            style={{
              flex: 1, background: isStaple ? "#0D9488" : "#6B7E8F", border: "none", color: "white",
              fontFamily: "'Lato', sans-serif", fontSize: "0.75rem", fontWeight: 700,
              letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer"
            }}
          >⭐ Staple</button>
          <button
            onClick={(e) => { e.stopPropagation(); handleRemove(); }}
            style={{
              flex: 1, background: "#8A7968", border: "none", color: "white",
              fontFamily: "'Lato', sans-serif", fontSize: "0.8rem", fontWeight: 700,
              letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer"
            }}
          >Hide</button>
        </div>
      ) : (
        <div style={{
          position: "absolute", inset: 0, background: "#8A7968", borderRadius: "8px",
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          paddingRight: "18px", opacity: isRevealing ? 1 : 0, transition: "opacity 0.15s"
        }}>
          <span style={{ color: "white", fontFamily: "'Lato', sans-serif", fontSize: "0.8rem", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>{removeLabel}</span>
        </div>
      )}
      <div
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? "none" : "transform 0.3s ease",
          touchAction: offsetX < 0 ? "none" : "pan-y",
          cursor: "grab",
          opacity: removing ? 0 : 1,
          pointerEvents: "auto",
        }}
        onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={handleEnd}
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onMouseMove={(e) => { if (e.buttons === 1) handleMove(e.clientX, e.clientY); }}
        onMouseUp={handleEnd}
        onMouseLeave={() => { if (swiping) handleEnd(); }}
      >
        {children}
      </div>
    </div>
  );
}

const VELAYO_LOGO_TEAL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAbgAAAH+CAYAAADuyxvCAAAACXBIWXMAAAsTAAALEwEAmpwYAAAgAElEQVR4nO19aXgc1Zn1/Cz23YawhCXsgYEMAwEmzwDJJDGEBCYQyAYk4SMJM0AmAb4EkwnLhBlIZkDeJHmTd3mV7bKk1i5L1i5r3/ddsixL1uIlme/H/Z631CW1qqul7lZ3vbeqzo/zJNju7rrnPfc9dbf3/o0SowoAHEAD0AA0AA0oDuPgb7gfAAAH0AA0AA1AAwoMDiJAIoAGoAFoABpQMYKDCJAIoAFoABpQXcsBpiglCAIADqABaAAaUGFwEAESATQADUAD0ICCERxEgEQADUAD0IDiUg4wRSlBEABwAA1AA9CACoODCJAIoAFoABqABhSM4CACJAJoABqABhSXcoApSgmCAIADaAAagAZUGBxEgEQADUAD0AA0oGAEBxEgEUAD0AA0oLiUA0xRShAEABxAA9AANKDC4CACJAJoABqABqABBSM4iACJABqABqABxaUcYIpSgiAA4AAagAagARUGBxEgEUAD0AA0AA0oGMFBBEgE0AA0AA0oLuUAU5QSBAEAB9AANAANqDA4iACJABqABqABaEDBCA4iQCKABqABaEBxKQeYopQgCAA4gAagAWhAhcFBBEgE0AA0AA1AAwpGcBABEgE0AA1AA4pLOcAUpQRBAMABNAANQAMqDA4iQCKABqABaAAaUDCCgwiQCKABaAAaUFzKAaYoJQgCAA6gAWgAGlBhcBABEgE0AA1AA9CAghEcRIBEAA1AA9CA4lIOMEUpQRAAcAANQAPQgAqDgwiQCKABaAAagAYUjOAgAiQCaAAagAYUl3KAKUoJggCAA2gAGoAGVBgcRIBEAA1AA9AANKBgBAcRIBFAA9AANKC4lANMUUoQBAAcQAPQADSgwuAgAiQCaAAagAagAQUjOIgAiQAagAagAcWlHGCKUoIgAOAAGoAGoAEVBgcRIBFAA9AANAANKBjBQQRIBNAANAANKC7lAFOUEgQBAAfQADQADagwOIgAiQAagAagAWhAwQgOIkAigAagAWhAcSkHmKKUIAgAOIAGoAFoQIXBQQRIBNAANAANQAMKRnAQARIBNAANQAOKSznAFKUEQQDAATQADUADKgwOIkAigAagAWgAGlAwgoMIkAigAWgAGlBcygGmKCUIAgAOoAFoABpQYXAQARIBNAANQAPQgIIRHESARAANQAPQgOJSDjBFKUEQAHAADUAD0IAKg4MIkAigAWgAGoAGFIzgIAIkAmgAGoAGFJdygClKCYIAgANoABqABlQYHESARAANQAPQADSgYAQHESARQAPQADSguJQDTFFKEAQAHEAD0AA0oMLgIAIkAmgAGoAGoAEFIziIAIkAGoAGoAHFpRxgilKCIADgABqABqABFQYHESARQAPQADQADSgYwUEESATQADQADSgu5QBTlBIEAQAH0AA0AA2oMDiIAIkAGoAGoAFoQMEIDiJAIoAGoAFoQHEpB5iilCAIADiABqABaECFwUEESATQADQADUADCkZwEAESATQADUADiks5wBSlBEEAwAE0AA1AAyoMDiJAIoAGoAFoABpQMIKDCJAIoAFoABpQXMoBpiglCAIADqABaAAaUGFwEAESATQADUAD0ICCERxEgEQADUAD0IDiUg4wRSlBEABwAA1AA9CACoODCJAIoAFoABqABhSM4CACJAJoABqABhSXcoApSgmCAIADaAAagAZUGBxEgEQADUAD0AA0oGAEBxEgEUAD0AA0oLiUA0xRShAEABxAA9AANKDC4CACJAJoABqABqABBSM4iACJABqABqABxaUcYIpSgiAA4AAagAagARUGBxEgEUAD0AA0AA0oGMFFVwS/yq0VDyXmo7Ohs0ED0EDENfDwznzxRm4ttBWDKUrLRfCD1KNi8NRZkVDfAwEiuUED0EDENbCpoUfLMS+lVUBfMeFxiDW4MEh78kCx6Js8I4ZOnRUDU2fFrQlZECASHDQADURMA7dszBT9U2e1HEP/+121FPqCwUU/yTy6u0B0T5zWhKfj47JWiA/JDRqABiKmgU/KW+fkmN7JM+Lr+wqhsRiM4KImgvt3HBZtJ0/NER6hc/y0uCreA/EhwUED0MCiNbA0ziM6xs3zDNb81ZC4xBRlkETdlpAlakcm/ESn4828eiQ3JDdoABpYtAbeyq8PmGcaTkyKL27Ohs5iYHARE8H16zPE0WMnA4qOUHdiQly0KhnCM+HvHBOcu+KQOI+w8pA434sLViWLC70gLi8mrE4Rl6xJEZeuSRGXrUkVl8emiis0eMQVcR6xJC5VLI33iCvjPOKq+DRx1do08bn4NHH12nRx9do0cc3aNHHtunRx7foMDdet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";

// Splash scene — Vessel Identity (SPEC_splash_vessel_identity_v2).
// COMMIT 1: static espresso scene + set animation (beats 3–4, Reveal + Hold).
// The wordmark surfaces, the arch draws in, the tagline fades, and the Velayo
// footer fades in last and slowest. Threshold/tap-to-enter (beats 1–2), the BVI
// water wash (beat 5), and the measured header hand-off (beat 6) land in later
// commits. A prefers-reduced-motion variant is built alongside, not retrofitted.
const OP_EASE = "cubic-bezier(0.16,1,0.3,1)";
// Timing (ms). MIN/FAILSAFE per §5; REVEAL covers beats 3–4 + a short hold.
const OP_MIN_VISIBLE = 2000; // never dissolve before the scene has been seen
const OP_REVEAL_MS = 4200;   // from crest: footer settles ~3.8s, then a beat
const OP_FAILSAFE_MS = 5000; // §5 max: a stuck load must never trap the user
const OP_REDUCED_HOLD = 400; // reduced-motion: brief settle before the gate
const OP_FADE_MS = 700;      // reduced-motion dissolve fade duration
const OP_WASH_MAX = 3400;    // wash: HARD bound on unmount (clip ~2.8s + buffer; §9 safety)
const OP_GROUP_CENTER = 0.48; // arch+wordmark+tagline group centre, as a fraction of the VISIBLE viewport (just above true centre)
function SplashScreen({ onDone, ready, headerTitleRef }) {
  const reduced = typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 'threshold' (beat 1, holds for the tap) → 'crest' (beat 2 + reveal fire).
  const [phase, setPhase] = useState("threshold");
  const [revealDone, setRevealDone] = useState(false);
  const [fading, setFading] = useState(false);
  const [handoff, setHandoff] = useState(false); // measured hand-off armed (§6b)
  const mountRef = useRef(Date.now());
  const exitedRef = useRef(false);
  const canvasRef = useRef(null);
  const wmRef = useRef(null);      // splash wordmark — the thing that travels
  const wmWrapRef = useRef(null);  // wordmark wrapper — transform-free box to measure
  const rootRef = useRef(null);    // splash root — carries the measured position vars
  const audioRef = useRef(null);   // wave_hit.mp3 (§7)
  const primedRef = useRef(false); // audio unlocked on the entry tap, once

  // Single dissolve path — idempotent so the readiness gate and the failsafe can
  // both point here without racing to double-fire onDone. In full motion the BVI
  // wash (beat 5) IS the dissolve; reduced motion falls back to a plain fade.
  // Either way onDone fires on a HARD timer (never gated on particle completion),
  // so a stalled loop can't leave the overlay covering the header.
  const exit = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    if (reduced) {
      setFading(true);
      setTimeout(() => onDone(), OP_FADE_MS);
      return;
    }
    // Measure the hand-off target NOW (§6b): the real header title is in the DOM
    // beneath us, at its final resting place (ready === true). Compute the exact
    // translate + scale from the two rects and arm the travel; if it isn't
    // measurable (e.g. wordmark hidden over a photo), fall back to a clean fade —
    // never a misaligned landing.
    const wm = wmRef.current;
    const target = headerTitleRef && headerTitleRef.current;
    let ok = false;
    if (wm && target) {
      const wr = wm.getBoundingClientRect();
      const tr = target.getBoundingClientRect();
      const tf = parseFloat(getComputedStyle(target).fontSize) || 0;
      const wf = parseFloat(getComputedStyle(wm).fontSize) || 40;
      if (tr.width > 4 && tr.height > 4 && tf > 4) {
        const s = tf / wf;
        const dx = (tr.left + tr.width / 2) - (wr.left + wr.width / 2);
        const dy = (tr.top + tr.height / 2) - (wr.top + wr.height / 2);
        wm.style.setProperty("--op-dx", dx.toFixed(2) + "px");
        wm.style.setProperty("--op-dy", dy.toFixed(2) + "px");
        wm.style.setProperty("--op-s", s.toFixed(4));
        ok = true;
      }
    }
    setHandoff(ok);
    setPhase("wash");
    // Audio (§7): the wave breaks as the water floods. Play unmuted here (already
    // unlocked by the muted priming pass on the entry tap → no double-wave). Do
    // NOT start it earlier — the break stays locked to the flood.
    // The visual wash finishes ~2.2s but the clip washes out to silence over
    // ~2.8s. Keep the (now transparent, non-interactive) overlay mounted until the
    // clip's 'ended' fires so the tail isn't cut; a failsafe bounds a blocked or
    // errored clip (§9: unmount still always happens).
    let done = false;
    const finish = () => { if (done) return; done = true; onDone(); };
    const a = audioRef.current;
    if (a) {
      try { a.muted = false; a.currentTime = 0; const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* blocked */ }
      a.addEventListener("ended", finish, { once: true });
    }
    setTimeout(finish, OP_WASH_MAX);
  }, [reduced, onDone, headerTitleRef]);

  // The entry tap (beat 2) — the SINGLE entry point (also the audio-unlock
  // gesture, §7). Prime the wave MUTED: play → pause, and CRUCIALLY stay muted
  // the whole time (the wash unmutes it, §exit). Unmuting here — inside the
  // play/pause .then — races the pause on some phones and leaks the clip's tail
  // audibly at the tap, i.e. the double-wave (trap 3). One tap only.
  const handleEnter = useCallback(() => {
    if (primedRef.current) return;
    primedRef.current = true;
    const a = audioRef.current;
    if (a) {
      a.muted = true;
      const pr = a.play();
      if (pr && pr.then) pr.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
    }
    setPhase((p) => (p === "threshold" ? "crest" : p));
  }, []);

  // Reduced motion: no threshold gesture, no parallax — the resolved scene shows,
  // settles briefly, then dissolves on readiness (failsafe still bounds it).
  useEffect(() => {
    if (!reduced) return;
    const rt = setTimeout(() => setRevealDone(true), OP_REDUCED_HOLD);
    const ft = setTimeout(() => exit(), OP_FAILSAFE_MS);
    return () => { clearTimeout(rt); clearTimeout(ft); };
  }, [reduced, exit]);

  // Full motion: once the user crests, let the reveal (beats 3–4) play, then arm
  // the §5 failsafe. revealDone gates the readiness dissolve below.
  useEffect(() => {
    if (reduced || phase !== "crest") return;
    const rt = setTimeout(() => setRevealDone(true), OP_REVEAL_MS);
    const ft = setTimeout(() => exit(), OP_FAILSAFE_MS);
    return () => { clearTimeout(rt); clearTimeout(ft); };
  }, [reduced, phase, exit]);

  // Readiness gate (§5): dissolve only once the reveal has settled AND the app is
  // ready (!loading, auth resolved) — and never before the minimum visible time.
  useEffect(() => {
    if (!revealDone || !ready) return;
    const remaining = OP_MIN_VISIBLE - (Date.now() - mountRef.current);
    if (remaining > 0) {
      const t = setTimeout(() => exit(), remaining);
      return () => clearTimeout(t);
    }
    exit();
  }, [revealDone, ready, exit]);

  // Compose the arch + wordmark + horizon line + tagline as ONE group and place
  // the GROUP, not each element from the top (which left it top-heavy with a dead
  // span above the bottom-pinned footer). Everything is expressed as fixed
  // relationships to the wordmark (§3, Dan's overlay test) — arch 0.8× its width
  // above the cap-line, line/tagline a fixed fraction of the font below the box —
  // so the internal spacing is viewport-independent (no more arch creep / line on
  // the descenders). Then the whole group is centred so the space ABOVE it equals
  // the space BELOW it to the footer, which lands it just above true centre on a
  // tall phone. Re-measured on resize / orientation / font load. The group is
  // opacity 0 until the crest, so setting these after paint causes no jump.
  const measure = useCallback(() => {
    const root = rootRef.current, wrap = wmWrapRef.current, wm = wmRef.current;
    if (!root || !wrap || !wm) return;
    const wmH = wrap.getBoundingClientRect().height || 40; // height only (position-independent)
    const fs = parseFloat(getComputedStyle(wm).fontSize) || 40;
    const archW = 0.52 * (wm.offsetWidth || 238);          // §3 locked ratio
    const tagH = 1.3 * 11;                                  // tagline line box (~14px)
    const aboveWm = 0.8 * archW;                            // arch top sits this far above the wordmark box top
    const belowWm = wmH + 1.6 * fs + tagH;                  // tagline bottom sits this far below the box top
    const groupH = aboveWm + belowWm;
    // Center against the VISIBLE viewport (visualViewport), NOT the layout viewport:
    // on mobile a position:fixed overlay is sized to the taller layout viewport, so
    // % / getBoundingClientRect heights overstate what's on screen and the cluster
    // read high. visualViewport.height is exactly what the user sees; the overlay's
    // top aligns with the visible top, so px-from-top maps 1:1 to the visible area.
    const vv = window.visualViewport;
    const visH = (vv && vv.height) || window.innerHeight || root.getBoundingClientRect().height;
    const groupCenter = OP_GROUP_CENTER * visH;             // optical centre just above true centre
    const wmTop = groupCenter - groupH / 2 + aboveWm;
    const wmBottom = wmTop + wmH;
    root.style.setProperty("--op-wm-top", wmTop.toFixed(1) + "px");
    root.style.setProperty("--op-arch-w", archW.toFixed(1) + "px");
    root.style.setProperty("--op-arch-top", (wmTop - aboveWm).toFixed(1) + "px");
    root.style.setProperty("--op-bloom-top", (wmBottom + 0.6 * fs).toFixed(1) + "px"); // clear of the descenders
    root.style.setProperty("--op-tag-top", (wmBottom + 1.6 * fs).toFixed(1) + "px");
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    const vv = window.visualViewport;
    if (vv) vv.addEventListener("resize", measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure).catch(() => {});
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      if (vv) vv.removeEventListener("resize", measure);
    };
  }, [measure]);

  // BVI water wash (beat 5, §9). Additive-blended water-light particles rise with
  // lateral drift and clear BOTTOM-UP, reinforcing surfacing. Tuned for phone
  // fill-rate (desktop was never the constraint): (1) backing store capped at DPR
  // 1.5 — soft light needs no 2–3× resolution; (2) particle count scaled to the
  // device, fewer but slightly larger; (3) each colour's soft radial pre-rendered
  // ONCE to a sprite and blitted, instead of a gradient built per particle per
  // frame — the single biggest win. Still reads as light, not dots.
  // Bounded two ways so it can NEVER stall as a block over the header: a hard
  // frame cap ends the loop, and unmount (onDone's timer) cancels the rAF.
  useEffect(() => {
    if (reduced || phase !== "wash") return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5); // fill-rate cap (was 2)
    const rect = cv.getBoundingClientRect();
    const cssW = rect.width, cssH = rect.height;
    const W = Math.max(1, Math.round(cssW * DPR));
    const H = Math.max(1, Math.round(cssH * DPR));
    cv.width = W; cv.height = H;
    // BVI band — water tones ONLY (no warm mix, which reads as confetti), weighted
    // to pale aqua / turquoise so overlaps read as sunlit water, not dots.
    const COLORS = [[226,247,247],[168,231,230],[168,231,230],[94,206,205],[94,206,205],[38,169,177],[17,124,140]];
    // Pre-render each colour's soft radial sprite ONCE. Per frame we blit a cached
    // sprite (a GPU texture copy) instead of allocating+rasterising a gradient per
    // particle — same soft falloff, a fraction of the cost.
    const SPRITE = 64;
    const sprites = COLORS.map((c) => {
      const s = document.createElement("canvas"); s.width = SPRITE; s.height = SPRITE;
      const g = s.getContext("2d");
      const grad = g.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
      grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},1)`);
      grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      g.fillStyle = grad; g.fillRect(0, 0, SPRITE, SPRITE);
      return s;
    });
    // Scale the count to the screen rather than a fixed number; fewer, slightly
    // larger particles read the same at speed (was a fixed ~2850).
    const count = Math.max(500, Math.min(2200, Math.round(cssW * cssH / 220)));
    const parts = [];
    for (let n = 0; n < count; n++) {
      const x = Math.random() * W;
      const y = (0.12 + Math.random() * 0.88) * H;    // below the wordmark/header band
      parts.push({
        x, y,
        vx: (Math.random() - 0.5) * 0.6 * DPR,
        vy: -(0.4 + Math.random() * 1.2) * DPR,        // rise
        life: 0, ttl: 70 + Math.random() * 50,
        r: (1.4 + Math.random() * 2.6) * DPR,          // slightly larger to offset the lower count
        sprite: sprites[(Math.random() * sprites.length) | 0],
        delay: (1 - y / H) * 14,                       // bottom starts first → clear bottom-up
      });
    }
    let raf = 0, frames = 0;
    const MAX_FRAMES = 190;                       // backstop; unmount cancels sooner
    const draw = () => {
      frames++;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";   // additive → overlaps are light
      let alive = 0;
      for (const p of parts) {
        if (p.delay > 0) { p.delay--; alive++; continue; }
        p.life++;
        const t = p.life / p.ttl;
        if (t >= 1) continue;
        alive++;
        p.x += p.vx; p.y += p.vy; p.vy *= 0.99;
        p.vx += (Math.random() - 0.5) * 0.08 * DPR;  // lateral caustic drift
        const rr = p.r * (1 - t * 0.4) * 2.4;
        const d = rr * 2;
        ctx.globalAlpha = (1 - t) * 0.8;
        ctx.drawImage(p.sprite, p.x - rr, p.y - rr, d, d);  // blit cached soft sprite
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      if (alive > 0 && frames < MAX_FRAMES) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, W, H);             // finish clean — no residual block
    };
    raf = requestAnimationFrame(draw);
    return () => { if (raf) cancelAnimationFrame(raf); try { ctx.clearRect(0, 0, W, H); } catch (e) { /* unmounting */ } };
  }, [reduced, phase]);

  const crested = !reduced && (phase === "crest" || phase === "wash"); // hold reveal end-states through the wash
  const washing = !reduced && phase === "wash";
  const rootClass = `op-splash${crested ? " op-crest" : ""}${washing ? " op-wash" : ""}${handoff ? " op-handoff" : ""}${reduced ? " op-reduced" : ""}`;

  return (
    <div
      ref={rootRef}
      className={rootClass}
      style={{
        opacity: fading ? 0 : 1,
        cursor: !reduced && phase === "threshold" ? "pointer" : "default",
        // Once dissolving the overlay is transparent but still mounted (for the
        // audio tail / fade) — let taps reach the app revealed beneath.
        pointerEvents: (washing || fading) ? "none" : undefined,
      }}
      onClick={!reduced ? handleEnter : undefined}
    >
      <style>{`
        .op-splash {
          position: fixed; inset: 0; z-index: 999; overflow: hidden;
          transition: opacity 0.7s ease;
        }
        /* Scene container — everything that must FADE AWAY as the app is revealed
           (ground, atmosphere, arch, tagline, footer). The wordmark and the wash
           layers deliberately live OUTSIDE it so the name stays the still point and
           the turquoise sheet can wash over a fading scene. */
        .op-scene { position: absolute; inset: 0; z-index: 1; }
        /* Open espresso ground — was on the root in commits 1–2; moved to its own
           fadeable layer so the wash can dissolve it to reveal the app beneath. */
        .op-ground {
          position: absolute; inset: 0; z-index: 0;
          background: radial-gradient(140% 100% at 50% 44%, #4a2f18 0%, #2C1A0E 46%, #160B04 100%);
        }
        /* Threshold atmosphere (beats 1–2). Depth/vignette/bloom animate on crest
           via GPU-friendly props ONLY — opacity + transform (no gradient/box-shadow
           tweening). The ground holds the OPEN gradient; the closed depth layer
           sits over it and fades away to reveal it. */
        .op-depth {
          position: absolute; inset: 0; z-index: 0; pointer-events: none;
          background: radial-gradient(80% 55% at 50% 55%, #24140a 0%, #1A0E06 45%, #0d0602 100%);
          transform: scale(1.15);
        }
        .op-crest .op-depth { animation: opDepthOpen 2.4s cubic-bezier(0.19,1,0.22,1) forwards; }
        @keyframes opDepthOpen { to { opacity: 0; transform: scale(1); } }
        /* Vignette as a scalable radial mask — tight in threshold, retreats on crest
           (scale out + fade), so no box-shadow paint tweening. */
        .op-vignette {
          position: absolute; inset: -20%; z-index: 1; pointer-events: none;
          background: radial-gradient(ellipse 60% 55% at 50% 50%, transparent 40%, rgba(0,0,0,0.92) 100%);
          transform: scale(1);
        }
        .op-crest .op-vignette { animation: opVigOpen 2.2s cubic-bezier(0.19,1,0.22,1) forwards; }
        @keyframes opVigOpen { to { transform: scale(1.6); opacity: 0.35; } }
        /* Horizon bloom — a thin, defined horizontal line (§2): brightest at
           center, falling off toward both edges — a HORIZON, not a cloud. Cool/pale
           light on the espresso. Sits just BELOW the wordmark, close under the
           letterforms; it must NEVER intrude on the locked arch-to-wordmark gap
           above (Dan's overlay test). Blooms outward from center via scaleX
           (compositor), not width.
           POSITION is measured relative to the WORDMARK's real box (see measure()):
           a fixed fraction of the font size below the measured baseline/box bottom,
           so descenders always clear it — constant at every viewport, not a
           viewport-% that drifted. Fallback applies only pre-JS (line is opacity 0). */
        .op-bloom {
          position: absolute; left: 50%; top: var(--op-bloom-top, 57%); z-index: 2; pointer-events: none;
          width: 120vw; height: 3px; margin-top: -1.5px; margin-left: -60vw;
          background: radial-gradient(closest-side,
            rgba(226,247,247,0.95) 0%,
            rgba(168,231,230,0.7) 30%,
            rgba(94,206,205,0.3) 60%,
            rgba(38,169,177,0.0) 100%);
          opacity: 0; transform: scaleX(0.02); filter: blur(1px);
        }
        .op-crest .op-bloom { animation: opBloom 2.2s cubic-bezier(0.19,1,0.22,1) 0.1s forwards; }
        @keyframes opBloom {
          0%   { opacity: 0;   transform: scaleX(0.02); }  /* a point at center */
          35%  { opacity: 1;   transform: scaleX(0.85); }  /* blooms outward */
          100% { opacity: 0.6; transform: scaleX(1); }     /* settles as a horizon */
        }
        /* Tap-to-enter prompt — slow breathe (opacity only). Static letter-spacing
           is fine; only ANIMATING it janks (trap 2). Fades out on crest. */
        .op-prompt {
          /* It is the only instruction on screen — must stay clearly readable
             through the whole breath, incl. outdoors. Floor raised well up (never
             below legible) and base colour lightened for luminance. */
          position: absolute; left: 0; right: 0; top: 72%; text-align: center; z-index: 6;
          font-family: 'Lato', sans-serif; font-weight: 300; font-size: 11px;
          letter-spacing: 6px; text-transform: uppercase; color: #E6D2AC;
          animation: opBreathe 3.4s ease-in-out infinite;
        }
        @keyframes opBreathe { 0%,100% { opacity: 0.62; } 50% { opacity: 0.98; } }
        .op-crest .op-prompt { animation: opFadeOut 0.4s ease forwards; }
        @keyframes opFadeOut { to { opacity: 0; } }
        /* Arch — ABSOLUTELY positioned (trap 1): never inside the wordmark's flex
           column, where a margin would just recenter the cluster and collapse the
           gap. Width = 0.52 × wordmark (~124px); floats higher with clear espresso
           air below it before the letter tops. */
        .op-arch {
          /* top + width are measured relative to the wordmark (see measure()); the
             fallbacks apply only for the first frame before JS runs (arch is opacity 0). */
          position: absolute; left: 50%; top: var(--op-arch-top, 39.6%); transform: translateX(-50%);
          width: var(--op-arch-w, 124px); height: auto; overflow: visible; opacity: 0; z-index: 8;
        }
        .op-arch path {
          fill: none; stroke: #0D9488; stroke-width: 2.4; stroke-linecap: round;
          stroke-dasharray: 150; stroke-dashoffset: 150;
        }
        /* Wordmark — centered by its wrapper (text-align), so its own transform is
           free for the surface animation. Anchored proportionally (~430/844). */
        .op-wm-wrap {
          /* top is the measured GROUP position (see measure()); fallback pre-JS only. */
          position: absolute; left: 0; right: 0; top: var(--op-wm-top, 50.95%);
          text-align: center; pointer-events: none; z-index: 4; /* above scene(1), sheet(2), canvas(3) */
          font-size: 40px; line-height: 1; /* strut matches the wordmark so its measured box is tight */
        }
        .op-wm {
          display: inline-block; font-family: 'Playfair Display', serif;
          font-style: italic; color: #FAF4EC; white-space: nowrap;
          font-size: 40px; line-height: 1; letter-spacing: 0.02em; /* matches header for a seamless hand-off */
          opacity: 0; transform: translateY(54px) scale(0.94); filter: blur(12px);
        }
        .op-wm .o { font-weight: 400; }
        .op-wm .p { font-weight: 700; }
        .op-tag {
          /* Also wordmark-relative (measured) — below the horizon line, not a
             viewport-% that would drift on resize. Fallback pre-JS only. */
          position: absolute; left: 0; right: 0; top: var(--op-tag-top, 62%); text-align: center; z-index: 6;
          font-family: 'Lato', sans-serif; font-weight: 300; font-size: 11px;
          letter-spacing: 4px; text-transform: uppercase; color: #C9A97A; opacity: 0;
        }
        /* Footer — the colophon: transparent V-mark over VELAYO INC., bottom-pinned,
           no bar, no divider, floating on the espresso. Fades in last and slowest. */
        .op-foot {
          position: absolute; left: 0; right: 0; bottom: 36px; z-index: 6;
          display: flex; flex-direction: column; align-items: center; gap: 8px; opacity: 0;
        }
        .op-foot img { width: 26px; height: auto; opacity: 0.9; }
        .op-foot .op-vt {
          font-family: 'Lato', sans-serif; font-weight: 400; font-size: 10px;
          letter-spacing: 4px; color: #C9A97A; opacity: 0.8;
        }
        /* Reveal choreography (beats 3–4). GPU-friendly props ONLY — opacity,
           transform, filter:blur. NO letter-spacing animation (trap 2: per-frame
           text reflow janks). */
        .op-crest .op-wm { animation: opSurface 1.8s ${OP_EASE} 0.5s forwards; }
        @keyframes opSurface { to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
        .op-crest .op-arch { animation: opArchIn 1.5s ease 0.9s forwards; }
        @keyframes opArchIn { to { opacity: 0.92; } }
        .op-crest .op-arch path { animation: opArchDraw 1.4s cubic-bezier(0.22,1,0.36,1) 1.0s forwards; }
        @keyframes opArchDraw { to { stroke-dashoffset: 0; } }
        .op-crest .op-tag { animation: opFadeIn 1.2s ease 2.1s forwards; }
        .op-crest .op-foot { animation: opFadeIn 1.3s ease 2.5s forwards; }
        @keyframes opFadeIn { to { opacity: 1; } }
        /* Reduced motion: resolved state, no parallax/particles, simple fade. */
        .op-reduced .op-wm { opacity: 1; transform: none; filter: none; }
        .op-reduced .op-arch { opacity: 0.92; }
        .op-reduced .op-arch path { stroke-dashoffset: 0; }
        .op-reduced .op-tag { opacity: 1; }
        .op-reduced .op-foot { opacity: 1; }

        /* ── BVI water wash (beat 5, §9) ── The translucent turquoise sheet floods
           UP over the scene, then recedes UP to reveal the app beneath. The scene
           fades under it so what surfaces is the app, not espresso. Sheet + canvas
           sit above the scene but BELOW the wordmark (the still point). Everything
           here is transform + opacity — GPU-friendly. */
        .op-watersheet {
          position: absolute; inset: 0; z-index: 2; pointer-events: none; opacity: 0;
          background: linear-gradient(180deg,
            rgba(226,247,247,0.0) 0%,
            rgba(168,231,230,0.55) 30%,
            rgba(94,206,205,0.65) 60%,
            rgba(38,169,177,0.55) 100%);
          transform: translateY(100%);
        }
        .op-canvas { position: absolute; inset: 0; z-index: 3; pointer-events: none; width: 100%; height: 100%; }
        .op-wash .op-watersheet { animation: opFlood 2.2s cubic-bezier(0.4,0,0.2,1) forwards; }
        @keyframes opFlood {
          0%   { opacity: 0;   transform: translateY(100%); }  /* below the fold */
          35%  { opacity: 1;   transform: translateY(0); }     /* floods over the view */
          65%  { opacity: 0.9; transform: translateY(0); }
          100% { opacity: 0;   transform: translateY(-100%); } /* recedes up, app revealed */
        }
        .op-wash .op-scene { animation: opSceneFade 1.4s ease 0.3s forwards; }
        @keyframes opSceneFade { to { opacity: 0; } }
        /* Wordmark hand-off (beat 6, §6b) — the name travels to the header title's
           measured rect/size (--op-dx/dy/s set at runtime), then crossfades as the
           real header title surfaces beneath. Starts from the surfaced state so
           there is no jump. Placed AFTER the reveal rule so it wins the animation. */
        .op-handoff .op-wm {
          animation:
            opHandoff 1.5s cubic-bezier(0.5,0,0.15,1) forwards,
            opHandFade 0.4s ease 1.35s forwards;
        }
        @keyframes opHandoff {
          from { opacity: 1; transform: translate(0px,0px) scale(1); filter: blur(0); }
          to   { opacity: 1; transform: translate(var(--op-dx,0px), var(--op-dy,0px)) scale(var(--op-s,1)); filter: blur(0); }
        }
        @keyframes opHandFade { to { opacity: 0; } }
        /* Fallback (§6b): if the hand-off couldn't be measured, the wordmark simply
           fades with the wash — a clean dissolve, never a misaligned landing. */
        .op-wash:not(.op-handoff) .op-wm-wrap { animation: opFadeOut 0.6s ease 1.5s forwards; }
      `}</style>

      {/* Scene — everything that fades away under the wash. The ground carries the
          espresso; atmosphere is full-motion only (reduced collapses to a fade). */}
      <div className="op-scene">
        <div className="op-ground" aria-hidden="true" />
        {!reduced && <div className="op-depth" aria-hidden="true" />}
        {!reduced && <div className="op-vignette" aria-hidden="true" />}
        {!reduced && <div className="op-bloom" aria-hidden="true" />}

        <svg className="op-arch" viewBox="0 0 120 22" aria-hidden="true">
          <path d="M4 20 Q60 -2 116 20" />
        </svg>

        <div className="op-tag">Save time. Shop smarter.</div>

        <div className="op-foot">
          <img src={process.env.PUBLIC_URL + "/velayo-mark.png"} alt="Velayo" />
          <div className="op-vt">VELAYO INC.</div>
        </div>

        {!reduced && phase === "threshold" && <div className="op-prompt">Tap to enter</div>}
      </div>

      {/* Wash layers — above the fading scene, below the wordmark. Full motion only. */}
      {!reduced && <div className="op-watersheet" aria-hidden="true" />}
      {!reduced && <canvas className="op-canvas" ref={canvasRef} aria-hidden="true" />}

      {/* Wordmark — the still point everything resolves around; on the wash it
          travels to become the header title (§6b). Sits above the wash so the name
          stays intact. */}
      <div className="op-wm-wrap" ref={wmWrapRef}>
        <span className="op-wm" ref={wmRef}>
          <span className="o">Our</span><span className="p">Provisions</span>
        </span>
      </div>

      {/* Wave audio (§7): the single sound, only when water is visible. Primed
          muted on the entry tap, played once at the wash. An <audio> element (not
          Web Audio) respects the device silent switch. */}
      {!reduced && <audio ref={audioRef} src={process.env.PUBLIC_URL + "/wave_hit.mp3"} preload="auto" />}
    </div>
  );
}

function HouseholdDebugLog() {
  const { myHouseholds, activeHouseholdId, loadingHouseholds } = useActiveHousehold();
  useEffect(() => {
    if (!loadingHouseholds) {
    }
  }, [loadingHouseholds, activeHouseholdId, myHouseholds]);
  return null;
}

// Shared catalog row body (the inner .item-row, NOT the SwipeToRemove wrapper).
// Rendered from both Browse and Search so the two can't drift apart.
function CatalogItemRow({
  item, qty, rawCategory, showPrices, price, isEditing, priceInput,
  centsToDisplay, onUpdateQty, onPriceInput, onCommitPrice, onCancelEditPrice,
}) {
  return (
    <div className={`item-row ${qty > 0 ? "has-qty" : ""}`}>
      <div className="item-top">
        <span className="item-name">{item.name}</span>
        {qty === 0 ? (
          <button className="add-btn" onClick={(e) => { onUpdateQty(item.name, 1, rawCategory); e.currentTarget.blur(); }}>Add</button>
        ) : (
          <div className="qty-controls">
            <button className="qty-btn" onClick={() => onUpdateQty(item.name, qty - 1, rawCategory)}>−</button>
            <span className="qty-display">{qty}</span>
            <button className="qty-btn" onClick={() => onUpdateQty(item.name, qty + 1, rawCategory)}>+</button>
          </div>
        )}
      </div>
      {showPrices && (
        <div className="price-row">
          {isEditing ? (
            <div className="price-edit-wrap">
              <span style={{ fontFamily: "'Lato',sans-serif", fontSize: "0.82rem", color: "#8a7a60" }}>$</span>
              <input
                className="price-input" type="tel" inputMode="numeric"
                value={centsToDisplay(priceInput)} autoFocus
                onChange={(e) => onPriceInput(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") onCommitPrice(item.name); if (e.key === "Escape") onCancelEditPrice(); }}
              />
              <button className="price-save-btn" onClick={() => onCommitPrice(item.name)}>Save</button>
            </div>
          ) : (
            <span className="price-display">${price.toFixed(2)} each</span>
          )}
        </div>
      )}
      {showPrices && qty > 0 && <div className="item-subtotal">Subtotal: ${(qty * price).toFixed(2)}</div>}
    </div>
  );
}

// ── Shared declutter cycle control ──
// One 46×46 icon used identically on Browse and Shop. Encodes both axes:
// background light→dark = filter off→on (phase 0 vs 1/2); line shape tapering
// (funnel ∨) → equal = grouped → flat (phase 2). Each tap advances 0→1→2→0.
function CycleIcon({ phase, onAdvance }) {
  return (
    <button
      className={`cyc-ico ${phase !== 0 ? "on" : ""}`}
      onClick={onAdvance}
      aria-label="Declutter view"
      title="Declutter view"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
        {phase === 2 ? (
          <>
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="4" y1="12" x2="20" y2="12"/>
            <line x1="4" y1="18" x2="20" y2="18"/>
          </>
        ) : (
          <>
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="7" y1="12" x2="17" y2="12"/>
            <line x1="10" y1="18" x2="14" y2="18"/>
          </>
        )}
      </svg>
    </button>
  );
}

// Flat-view header shared by both tabs' phase-2 render.
function FlatHeader({ count }) {
  return <div className="flat-header">A–Z · {count} {count === 1 ? "item" : "items"}</div>;
}

function ProvisionsApp() {
  const { user, isSignedIn, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { activeHouseholdId, myHouseholds, switchHousehold, refreshHouseholds, resolveAfterHouseholdLoss, beginDeliberateLoss, endDeliberateLoss } = useActiveHousehold();

  const {
    quantities,
    checked,
    prices: supabasePrices,
    categoryAvgPrices,
    contributorsMap,
    household,
    householdMembers,
    catalogMap,
    setCatalogMap,
    listRows,
    loading,
    error,
    dismissError,
    updateQty,
    updatePrice,
    toggleChecked,
    updateBudgetGoal,
    hideItem,
    deleteItem,
    removeFromList,
    hiddenCatalogItems,
    restoreHiddenByCategory,
    unhideItem,
    createInvite,
    toggleStaple,
    renameItem,
    refreshCatalog,
    updateFullName,
    activeCycle,
    wrapUpTrip,
    createHousehold,
    refreshMembers,
    uploadHouseholdPhoto,
    updateHouseholdBanner,
    supabase,
    _supabase,
    _household,
    _clerkId,
    _internalUserId,
  } = useProvisions({
    getToken,
    userId: isLoaded ? user?.id : undefined,
    clerkId: isLoaded ? user?.id : undefined,
    email: user?.primaryEmailAddress?.emailAddress,
    fullName: user?.fullName || null,
    activeHouseholdId,
    myHouseholds,
  });

  const [showSplash, setShowSplash] = useState(true);
  const handleSplashDone = useCallback(() => setShowSplash(false), []);
  // The real header title — the splash wordmark hands off to its measured rect (§6b).
  const headerTitleRef = useRef(null);
  const [localPrices, setLocalPrices] = useState({});
  // Merge: supabase prices override local defaults when available
  const prices = useMemo(() => ({ ...localPrices, ...supabasePrices }), [localPrices, supabasePrices]);
  const [view, setView] = useState("input");
  const [editingPrice, setEditingPrice] = useState(null);
  const [priceInput, setPriceInput] = useState("");
  const [editModalItem, setEditModalItem] = useState(null);

  const [removeConfirmItem, setRemoveConfirmItem] = useState(null);

  // SHOP swipe-to-remove. Own item (sole contributor) → remove immediately.
  // Shared item (anyone else contributed) → confirm first.
  const handleSwipeRemove = (item) => {
    const contributors = item.contributors || [];
    const sharedByOther = contributors.some(c => c.clerkId && c.clerkId !== user?.id);
    if (sharedByOther) {
      setRemoveConfirmItem({
        name: item.name,
        catalogItemId: item.catalogItemId,
        addedByName: item.addedBy || (contributors.find(c => c.clerkId !== user?.id)?.fullName) || "someone else",
      });
    } else {
      removeFromList(item.name, item.catalogItemId);
    }
  };
  const [editModalName, setEditModalName] = useState("");
  const [editModalPrice, setEditModalPrice] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemCategory, setNewItemCategory] = useState(CATEGORY_ORDER[0]);
  const [addError, setAddError] = useState("");
  const [addModalResetDone, setAddModalResetDone] = useState(false);
  const [invitePreparing, setInvitePreparing] = useState(false); // share hand-off link generation in flight
  const [joinBanner, setJoinBanner] = useState(null); // household name after accepting
  const [pendingJoinId, setPendingJoinId] = useState(null); // joined household id awaiting the lens switch (reactive; see join effect)
  const [showVelayoMenu, setShowVelayoMenu] = useState(false);
  const [showHouseholdModal, setShowHouseholdModal] = useState(false);
  // ── Edit household sheet (OurBanner) — draft state, committed on Save ──
  const [showEditHousehold, setShowEditHousehold] = useState(false);
  const [edName, setEdName] = useState("");
  const [edPhotoPath, setEdPhotoPath] = useState(null); // existing stored path; null = none/removed
  const [edFile, setEdFile] = useState(null);           // newly chosen File, not yet uploaded
  const [edLocalUrl, setEdLocalUrl] = useState(null);   // object URL preview for edFile
  const [edX, setEdX] = useState(50);
  const [edY, setEdY] = useState(50);
  const [edZoom, setEdZoom] = useState(100);
  const [edWordmark, setEdWordmark] = useState("large");
  const [edSaving, setEdSaving] = useState(false);
  const [edDeleteConfirm, setEdDeleteConfirm] = useState(false);
  const edFileInputRef = useRef(null);
  const edDragRef = useRef(null); // { startX, startY, baseX, baseY }
  const [creating, setCreating] = useState(false);
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [creatingInFlight, setCreatingInFlight] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimerRef = useRef(null);
  const [showManageCategoriesModal, setShowManageCategoriesModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [renamingCategory, setRenamingCategory] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [deleteMoveTarget, setDeleteMoveTarget] = useState("");
  const [householdCategories, setHouseholdCategories] = useState(new Set());
  const [stapleFilter, setStapleFilter] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPickerOpen, setSearchPickerOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showWrapUpModal, setShowWrapUpModal] = useState(false);
  const [wrapUpRollItems, setWrapUpRollItems] = useState(new Set()); // item names to roll forward
  const [wrappingUp, setWrappingUp] = useState(false);
  // Shop declutter cycle: 0 default (grouped, all shown) · 1 tidied (grouped, checked hidden) · 2 flat (A–Z, checked hidden).
  // Ephemeral UI state — resets to 0 on tab/household switch (see effect below). Supersedes the old op_showCategories toggle.
  const [shopPhase, setShopPhase] = useState(0);
  // Browse declutter cycle: 0 default (pills shown, grouped) · 1 tidied (pills hidden, grouped) · 2 flat (A–Z).
  const [browsePhase, setBrowsePhase] = useState(0);
  // Declutter phase + Browse filters are per-view/per-household ephemeral state:
  // reset on tab or household switch so a stale filter can't shrink the new
  // household's list (phase 1 hides the pills that would otherwise explain it).
  useEffect(() => {
    setShopPhase(0);
    setBrowsePhase(0);
    setSelectedCategories(new Set());
    setStapleFilter(false);
  }, [view, activeHouseholdId]);
  // eslint-disable-next-line no-unused-vars
  const [categoryError, setCategoryError] = useState(null);

  const { signOut } = useClerk();
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [profileName, setProfileName] = useState(() => user?.fullName || "");
  const [showPrices, setShowPrices] = useState(() => {
    return localStorage.getItem('op_showPrices') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('op_showPrices', showPrices);
  }, [showPrices]);

  // Device-local list text size — persists the index (0–4), not the scale.
  const [textSizeIdx, setTextSizeIdx] = useState(() => {
    const saved = parseInt(localStorage.getItem("op_list_text_size"), 10);
    return Number.isInteger(saved) && saved >= 0 && saved < TEXT_STEPS.length ? saved : 1;
  });

  useEffect(() => {
    document.documentElement.style.setProperty("--op-list-scale", TEXT_STEPS[textSizeIdx]);
    localStorage.setItem("op_list_text_size", String(textSizeIdx));
  }, [textSizeIdx]);

  // Re-fetch the member roster each time the manage-households sheet opens,
  // so name changes by other members appear without a full page reload.
  useEffect(() => {
    if (showHouseholdModal) {
      refreshMembers();
    }
  }, [showHouseholdModal, refreshMembers]);

  const showToast = useCallback((message) => {
    setToastMessage(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2500);
  }, []);

  const budgetNum = household?.budget_goal ? parseFloat(household.budget_goal) : null;

  // Build categories from live Supabase catalog
  const categories = useMemo(() => {
    // Reverse lookup: display name → raw name (handles legacy emoji-named catalog rows)
    const displayToRaw = {};
    Object.entries(CATEGORY_DISPLAY).forEach(([raw, display]) => {
      displayToRaw[display] = raw;
    });

    const catMap = {};
    Object.values(catalogMap).forEach(item => {
      let cat = item.category || "Household";
      // Normalize: if the stored category is an emoji display name, map it back to raw
      if (displayToRaw[cat]) cat = displayToRaw[cat];
      if (!catMap[cat]) catMap[cat] = [];
      catMap[cat].push({ name: item.name });
    });

    // Sort categories: known order first, then custom
    const sorted = [];
    CATEGORY_ORDER.forEach(catKey => {
      if (catMap[catKey]) {
        sorted.push({
          name: CATEGORY_DISPLAY[catKey] || catKey,
          rawName: catKey,
          items: catMap[catKey].sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
    });
    // Append any unknown categories (custom items etc)
    Object.keys(catMap).forEach(catKey => {
      if (!CATEGORY_ORDER.includes(catKey)) {
        sorted.push({
          name: CATEGORY_DISPLAY[catKey] || catKey,
          rawName: catKey,
          items: catMap[catKey].sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
    });
    // Append empty household categories (created but no items yet)
    householdCategories.forEach(catKey => {
      if (!sorted.find(c => c.rawName === catKey)) {
        sorted.push({ name: catKey, rawName: catKey, items: [] });
      }
    });
    return sorted;
  }, [catalogMap, householdCategories]);

  const displayCategories = useMemo(() => {
    // Layer 1 — Staples is a cross-cutting filter applied first
    let result = stapleFilter
      ? categories
          .map(cat => ({
            ...cat,
            items: cat.items.filter(item => catalogMap[item.name]?.is_staple),
          }))
          .filter(cat => cat.items.length > 0)
      : categories;

    // Layer 2 — Category chips narrow within whatever Layer 1 produced.
    // Only narrow by categories that still exist, so a stale filter id
    // (e.g. a category deleted here or on another device) can never blank the view.
    const liveNames = new Set(result.map(cat => cat.rawName));
    const activeSelected = [...selectedCategories].filter(n => liveNames.has(n));
    if (activeSelected.length > 0) {
      result = result.filter(cat => activeSelected.includes(cat.rawName));
    }

    return result;
  }, [categories, stapleFilter, selectedCategories, catalogMap]);

  // Browse declutter phase 2 — flat A–Z across the filtered catalog (rawCategory attached for price fallback).
  const browseFlatItems = useMemo(() =>
    displayCategories
      .flatMap(cat => cat.items.map(item => ({ ...item, rawCategory: cat.rawName })))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [displayCategories]);
  // Count of active filters for the declutter descriptor line.
  const browseFilterCount = (stapleFilter ? 1 : 0) + selectedCategories.size;

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.trim().toLowerCase();
    const matches = [];
    categories.forEach(cat => {
      cat.items.forEach(item => {
        if (item.name.toLowerCase().includes(q)) {
          matches.push({ name: item.name, category: cat.name, rawCategory: cat.rawName });
        }
      });
    });
    return matches;
  }, [searchQuery, categories]);

  // Exact-normalized name key (F1b): lowercase + trim + collapse internal whitespace.
  // NEVER fuzzy — this gates a household-wide un-hide, so it must match exactly.
  const normalizeName = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

  // A hidden-but-live item whose name exactly matches the current query. `searchResults`
  // is built from the catalog map, which EXCLUDES hidden items — so such an item shows
  // as "No results" even though it is on the shared list. Surface it as a reveal card
  // instead of the false "add as new" (F1b Layer 1, the honest UX on top of the floor).
  const hiddenLiveMatch = useMemo(() => {
    const typed = searchQuery.trim();
    if (!typed) return null;
    const norm = normalizeName(typed);
    const hidden = hiddenCatalogItems.find(h => normalizeName(h.name) === norm);
    if (!hidden) return null;
    const liveRow = listRows.find(r => r.catalogItemId === hidden.id && (r.quantity || 0) > 0);
    return liveRow ? { item: hidden, qty: liveRow.quantity } : null;
  }, [searchQuery, hiddenCatalogItems, listRows]);

  // Search "add to your list" handler (F1b Layer 1 — the floor). Re-adding a HIDDEN
  // item must never write quantity across the person boundary: hide is a lens, not an
  // edit. Resolve the typed name against the hidden set first.
  const addSearchedItem = (rawCategory) => {
    const typed = searchQuery.trim();
    if (typed) {
      const norm = normalizeName(typed);
      const hidden = hiddenCatalogItems.find(h => normalizeName(h.name) === norm);
      if (hidden) {
        const liveRow = listRows.find(r => r.catalogItemId === hidden.id && (r.quantity || 0) > 0);
        if (liveRow) {
          // Live shared row exists → un-hide ONLY. No quantity write; reveal it as-is.
          unhideItem(hidden.id);
        } else {
          // Hidden while at qty 0 (not on the list) → un-hide, then add at typed qty.
          unhideItem(hidden.id);
          updateQty(typed, 1, rawCategory);
        }
      } else {
        // No hidden match → today's behavior: add as a (possibly new) item.
        updateQty(typed, 1, rawCategory);
      }
    }
    setSearchQuery("");
    setSearchPickerOpen(false);
    setNewCategoryInput("");
  };

  // Show the join banner once the lens has landed on the joined household.
  // Banner DISPLAY ONLY — the switch itself is driven by the durable-intent effect
  // below, decoupled from this guard. (Previously the switch was wired here, gated
  // on `household.name !== "My Household"`. That guard is exactly false for an
  // existing user still active in "My Household" whose lens hasn't moved yet, so on
  // slower prod loads the join flag was never consumed and the switch never fired.
  // See docs/SPEC_join_activates_household ADDENDUM_reopen.) We clear only the
  // banner-NAME flag here; the `_id` flag is consumed solely on a confirmed switch.
  useEffect(() => {
    if (loading || !household) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("invite");
    if (!code && household?.name && household.name !== "My Household" && !joinBanner) {
      const justJoined = sessionStorage.getItem("just_joined_household");
      if (justJoined) {
        setJoinBanner(justJoined); // always fires — sole feedback in the silent-join case
        sessionStorage.removeItem("just_joined_household");
      }
    }
  }, [loading, household]); // eslint-disable-line react-hooks/exhaustive-deps

  // Durable, retriable completion of the invite-join switch (ADDENDUM_reopen).
  // The sessionStorage flag `just_joined_household_id` — written by useProvisions
  // Effect 1 on joined_via_invite — is the source of truth for "unfinished join
  // intent": it survives reload, React state does not. We derive the switch from it
  // on EVERY relevant render (not once), so a slow prod membership propagation
  // (the joined household populating into myHouseholds a beat after load) can't
  // strand the join. The lens (switchHousehold) remains the single writer.
  const joinRefreshTriesRef = useRef(0);
  useEffect(() => {
    if (loading) return;
    const joinedId = sessionStorage.getItem("just_joined_household_id");
    if (!joinedId) return; // no unfinished join intent

    // Switch confirmed — the lens now points at the joined household. Consume the
    // durable flag and clear the intent ONLY here, after activeHouseholdId agrees.
    // Clearing before this is what stranded the intent on prod.
    if (activeHouseholdId === joinedId) {
      sessionStorage.removeItem("just_joined_household_id");
      if (pendingJoinId) setPendingJoinId(null);
      joinRefreshTriesRef.current = 0;
      return;
    }

    // Intent alive but not yet landed — keep pendingJoinId in sync with the flag.
    if (pendingJoinId !== joinedId) setPendingJoinId(joinedId);

    // Membership resolved: route the switch through the lens (the single writer).
    if (myHouseholds.some((h) => h.id === joinedId)) {
      switchHousehold(joinedId);
      return;
    }

    // Membership not yet propagated (prod latency): nudge get_my_households a bounded
    // number of times so a slow propagation can't strand the join indefinitely.
    if (joinRefreshTriesRef.current < 4) {
      joinRefreshTriesRef.current += 1;
      refreshHouseholds();
    }
  }, [loading, activeHouseholdId, myHouseholds, pendingJoinId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss the join banner: on a timer (success confirmations self-clear),
  // and immediately if the user switches away from the joined household (the
  // banner would otherwise contradict the header).
  //
  // Subtlety: the explicit-accept flow sets the banner BEFORE the async
  // switchHousehold(joinedId) lands, so for an existing user there is a brief
  // window where the banner shows the joined name while `household` is still the
  // PRIOR household. A naive "name !== joinBanner → clear" would fire in that
  // window and kill the banner on its own arrival. So we only treat a name
  // mismatch as "switched away" once the joined household has actually been
  // active at least once (bannerSeenRef). The 5s timer runs regardless and is
  // the safety net if arrival never happens.
  const bannerSeenRef = useRef(false);
  useEffect(() => {
    if (!joinBanner) { bannerSeenRef.current = false; return; }
    if (household?.name === joinBanner) {
      bannerSeenRef.current = true; // arrived at the joined household
    } else if (bannerSeenRef.current) {
      setJoinBanner(null); // arrived earlier, now switched away → stale, clear
      return;
    }
    const t = setTimeout(() => setJoinBanner(null), 5000);
    return () => clearTimeout(t);
  }, [joinBanner, household?.name]);

  // Invite → OS share sheet hand-off (spec D5). Generate a fresh link for the
  // active household, then hand the pre-filled "come aboard" message to
  // navigator.share(). No in-app share UI is rendered, so nothing can linger
  // after sending (the old banner bug is deleted by construction). On a platform
  // with no share sheet (desktop) we copy the message so the invite still lands.
  const handleInviteShare = async () => {
    if (invitePreparing) return;
    setInvitePreparing(true);
    try {
      const url = await createInvite();
      if (!url) { showToast("Couldn't prepare an invite link. Try again."); return; }
      const name = household?.name || "my household";
      const text = `Come aboard my OurProvisions list — join ${name} and it gets smarter as we go. ${url}`;
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title: "Come aboard my OurProvisions list", text });
        } catch (e) {
          if (e && e.name !== "AbortError") console.error("share failed:", e);
        }
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        showToast("Invite copied");
      }
    } finally {
      setInvitePreparing(false);
    }
  };


  // eslint-disable-next-line no-unused-vars
  const startEditPrice = (itemName) => {
    setEditingPrice(itemName);
    const existing = prices[itemName];
    setPriceInput(existing ? String(Math.round(existing * 100)) : "");
  };

  const openEditModal = (itemName) => {
    const catalogEntry = catalogMap[itemName];
    const isCustom = catalogEntry && catalogEntry.is_global === false;
    // Catalog (non-custom) items can only have their price edited; the name is
    // locked. With pricing off there's nothing to edit, so don't open an empty
    // modal. (The swipe Edit affordance is also suppressed for this case.)
    if (!isCustom && !showPrices) return;
    setEditModalItem({ name: itemName, isCustom });
    setEditModalName(itemName);
    const existing = prices[itemName];
    setEditModalPrice(existing ? String(Math.round(existing * 100)) : "");
  };

  const commitEditModal = async () => {
    if (!editModalItem) return;
    const oldName = editModalItem.name;
    const newName = editModalItem.isCustom ? editModalName.trim() : oldName;
    const priceVal = parseFloat(centsToDisplay(editModalPrice));

    if (!isNaN(priceVal) && priceVal >= 0) {
      setLocalPrices(prev => {
        const updated = { ...prev };
        if (newName !== oldName) delete updated[oldName];
        return { ...updated, [newName]: priceVal };
      });
      updatePrice(newName !== oldName ? newName : oldName, priceVal);
    }

    if (editModalItem.isCustom && newName && newName !== oldName) {
      await renameItem(oldName, newName);
    }

    setEditModalItem(null);
  };

  const handlePriceInput = (raw) => {
    // Strip non-digits, remove leading zeros
    const digits = raw.replace(/\D/g, "").replace(/^0+/, "") || "";
    setPriceInput(digits);
  };

  const centsToDisplay = (cents) => {
    if (!cents) return "0.00";
    const num = parseInt(cents, 10);
    return (num / 100).toFixed(2);
  };

  const commitPrice = (itemName) => {
    const val = parseFloat(centsToDisplay(priceInput));
    if (!isNaN(val) && val >= 0) {
      setLocalPrices(prev => ({ ...prev, [itemName]: val }));
      updatePrice(itemName, val);
    }
    setEditingPrice(null);
  };

  const handleAddItem = () => {
    const name = newItemName.trim();
    if (!name) { setAddError("Please enter an item name."); return; }
    const allItems = Object.keys(catalogMap).map(k => k.toLowerCase());
    if (allItems.includes(name.toLowerCase())) { setAddError("That item already exists."); return; }
    const price = parseFloat(centsToDisplay(newItemPrice)) || 0;
    if (price > 0) setLocalPrices(prev => ({ ...prev, [name]: price }));
    // updateQty with qty=1 will auto-create the catalog item in Supabase if it doesn't exist
    updateQty(name, 1, newItemCategory, price > 0 ? price : undefined);
    setNewItemName(""); setNewItemPrice(""); setAddError(""); setShowAddModal(false);
  };

  const createCategory = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setHouseholdCategories(prev => new Set([...prev, trimmed]));
    setNewCategoryName("");
  };

  const renameCategory = async (oldRawName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldRawName) return;
    const db = _supabase.current;
    const hh = _household.current;
    if (!db || !hh) return;

    const itemsInCat = Object.values(catalogMap).filter(i => i.category === oldRawName);
    const globalItems = itemsInCat.filter(i => i.is_global);
    const householdItems = itemsInCat.filter(i => !i.is_global);

    for (const item of globalItems) {
      const { error: insertErr } = await db
        .from("catalog_items")
        .insert({
          name: item.name,
          category: trimmed,
          is_global: false,
          household_id: hh.id,
          created_by: _internalUserId.current,
        })
        .select().single();
      if (insertErr) { setCategoryError(`Could not copy item: ${insertErr.message}`); return; }
      await db.from("user_hidden_items").insert({
        clerk_id: _clerkId.current,
        catalog_item_id: item.id,
      }).select();
    }

    if (householdItems.length > 0) {
      const { error: updateErr } = await db
        .from("catalog_items")
        .update({ category: trimmed })
        .eq("household_id", hh.id)
        .eq("category", oldRawName)
        .is("deleted_at", null);
      if (updateErr) { setCategoryError(`Could not rename: ${updateErr.message}`); return; }
    }

    await refreshCatalog();
    setShowManageCategoriesModal(false);
  };

  const handleResetCategories = async () => {
    const db = _supabase.current;
    const hh = _household.current;
    if (!db || !hh) return;
    const { error: delErr } = await db
      .from("catalog_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("household_id", hh.id)
      .eq("is_global", false)
      .is("deleted_at", null);
    if (delErr) { setCategoryError(`Could not reset: ${delErr.message}`); return; }
    await db
      .from("user_hidden_items")
      .delete()
      .eq("clerk_id", user.id);
    setShowResetConfirm(false);
    setShowManageCategoriesModal(false);
    await refreshCatalog();
  };

  const deleteCategory = async (rawName, moveTo) => {
    if (!supabase || !household) return;
    if (moveTo) {
      const { error: moveErr } = await supabase
        .from("catalog_items")
        .update({ category: moveTo })
        .eq("household_id", household.id)
        .eq("category", rawName)
        .is("deleted_at", null);
      if (moveErr) { return; }
      setCatalogMap(prev => {
        const updated = {};
        Object.entries(prev).forEach(([k, v]) => {
          updated[k] = v.category === rawName ? { ...v, category: moveTo } : v;
        });
        return updated;
      });
    } else {
      const itemsInCat = Object.values(catalogMap).filter(i => i.category === rawName);
      for (const item of itemsInCat) {
        await deleteItem(item.name);
      }
    }
    setHouseholdCategories(prev => { const s = new Set(prev); s.delete(rawName); return s; });
    setSelectedCategories(prev => { const s = new Set(prev); s.delete(rawName); return s; });
    setDeletingCategory(null);
    setDeleteMoveTarget("");
  };

  const openBudgetModal = () => {
    setBudgetInput(budgetNum !== null ? String(budgetNum) : "");
    setShowBudgetModal(true);
  };

  const saveBudget = () => {
    const val = parseFloat(budgetInput);
    if (!isNaN(val) && val > 0) {
      updateBudgetGoal(parseFloat(val.toFixed(2)));
    } else if (budgetInput === "" || budgetInput === "0") {
      updateBudgetGoal(null);
    }
    setShowBudgetModal(false);
  };

  const clearBudget = () => {
    updateBudgetGoal(null);
    setShowBudgetModal(false);
  };

  const handleWrapUp = async () => {
    setWrappingUp(true);
    await wrapUpTrip(Array.from(wrapUpRollItems));
    setWrappingUp(false);
    setShowWrapUpModal(false);
    setWrapUpRollItems(new Set());
  };

  const handleRemoveMember = async (m) => {
    const name = m.users?.full_name || (m.users?.email ? m.users.email.split("@")[0] : "this member");
    if (!window.confirm(`Remove ${name} from this household? Anything they added to the current list stays.`)) return;
    try {
      const { error } = await supabase.rpc("remove_member", {
        p_household_id: household.id,
        p_user_id: m.user_id,
      });
      if (error) throw error;
      await refreshMembers();
      await refreshHouseholds();
      showToast(`${name} removed`);
    } catch (err) {
      showToast(err.message || "Could not remove member");
    }
  };

  const handleLeaveHousehold = async () => {
    if (!window.confirm("Leave this household? Anything you added stays behind for the others.")) return;
    beginDeliberateLoss();                     // BEFORE the RPC — closes the watchdog gap
    try {
      const leftId = household.id;
      const { error } = await supabase.rpc("leave_household", {
        p_household_id: leftId,
      });
      if (error) throw error;
      setShowHouseholdModal(false);
      await refreshHouseholds();
      const remaining = myHouseholds.filter(h => h.id !== leftId);
      if (remaining.length > 0) switchHousehold(remaining[0].id);
      showToast("You left the household");
    } catch (err) {
      showToast(err.message || "Could not leave household");
    } finally {
      endDeliberateLoss();                     // always clears, even on error
    }
  };

  const handleDeleteHousehold = async () => {
    const deletedId = activeHouseholdId;
    beginDeliberateLoss();                     // BEFORE the RPC — closes the watchdog gap
    try {
      const { error } = await supabase.rpc('delete_household', { p_household_id: deletedId });
      if (error) throw error;
      setShowEditHousehold(false);
      setEdDeleteConfirm(false);
      setShowHouseholdModal(false);
      showToast("Household deleted");
      await resolveAfterHouseholdLoss(deletedId, false);
    } catch (err) {
      showToast(err.message || "Could not delete household");
    } finally {
      endDeliberateLoss();                     // always clears, even on error
    }
  };

  // ── Edit household sheet (OurBanner) ──
  // Am I the creator? Creator-only Delete gate (spec D4). The switcher already
  // proved the owner-role identity works; reuse it.
  const isHouseholdCreator = householdMembers.some(m => m.users?.clerk_id === user?.id && m.role === 'owner');

  // Draft has a photo when a new file is staged OR an existing stored path survives.
  const edHasPhoto = !!edFile || !!edPhotoPath;
  // Preview source: staged file wins; else the existing signed URL.
  const edPreviewUrl = edLocalUrl || (edPhotoPath ? household?.photoUrl : null);

  const openEditHousehold = () => {
    // Seed drafts from the active household. banner_wordmark is read raw (not the
    // photo-gated header value) so the segment reflects the persisted choice.
    setEdName(household?.name || "");
    setEdPhotoPath(household?.photo_path || null);
    setEdFile(null); setEdLocalUrl(null);
    setEdX(household?.photo_position_x ?? 50);
    setEdY(household?.photo_position_y ?? 50);
    setEdZoom(household?.photo_zoom ?? 100);
    setEdWordmark(household?.banner_wordmark || "large");
    setEdDeleteConfirm(false);
    setShowEditHousehold(true);
  };

  const closeEditHousehold = () => {
    if (edLocalUrl) URL.revokeObjectURL(edLocalUrl);
    setEdFile(null); setEdLocalUrl(null);
    setEdDeleteConfirm(false);
    setShowEditHousehold(false);
  };

  const onEdPickFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // allow re-picking the same file
    // Confirms the change handler actually fired (rules out a detached input /
    // unwired onChange). The upload itself happens on Save, not here.
    console.log("[photo pick] onChange fired; file:", file ? `${file.name} (${file.type}, ${file.size}b)` : "none");
    if (!file) return;
    if (edLocalUrl) URL.revokeObjectURL(edLocalUrl);
    setEdFile(file);
    setEdLocalUrl(URL.createObjectURL(file));
    setEdPhotoPath(null);           // a new file supersedes any stored path
    // A fresh photo starts at a sensible frame; the user tunes from here.
    setEdX(50); setEdY(46); setEdZoom(165);
  };

  const onEdRemovePhoto = () => {
    if (edLocalUrl) URL.revokeObjectURL(edLocalUrl);
    setEdFile(null); setEdLocalUrl(null);
    setEdPhotoPath(null);
    setEdX(50); setEdY(50); setEdZoom(100);
  };

  // Drag-to-reposition on the preview. Panning the finger right pans the image
  // right (shows more of its left) → background-position % decreases. Zoom scales
  // sensitivity so a big zoom doesn't feel sluggish.
  const onEdDragStart = (e) => {
    if (!edHasPhoto) return;
    const rect = e.currentTarget.getBoundingClientRect();
    edDragRef.current = {
      w: rect.width, h: rect.height,
      startX: e.clientX, startY: e.clientY, baseX: edX, baseY: edY,
    };
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onEdDragMove = (e) => {
    const d = edDragRef.current;
    if (!d) return;
    const k = edZoom / 100; // more zoom → same finger move covers less of the image
    const dxPct = ((e.clientX - d.startX) / d.w) * 100 / k;
    const dyPct = ((e.clientY - d.startY) / d.h) * 100 / k;
    const clamp = (v) => Math.max(0, Math.min(100, v));
    setEdX(Math.round(clamp(d.baseX - dxPct)));
    setEdY(Math.round(clamp(d.baseY - dyPct)));
  };
  const onEdDragEnd = (e) => {
    edDragRef.current = null;
    if (e.currentTarget.releasePointerCapture) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_e) {}
    }
  };

  const saveEditHousehold = async () => {
    if (edSaving) return;
    if (!edName.trim()) { showToast("Household needs a name"); return; }
    setEdSaving(true);
    try {
      const patch = { name: edName, banner_wordmark: edWordmark };
      let removedPath = null;
      if (edFile) {
        // New/replacement photo: normalize + upload, then commit path + framing.
        const path = await uploadHouseholdPhoto(edFile);
        if (!path) {
          // The hook already logged the exact failing stage; make it visible.
          showToast("Couldn't save the photo. Please try again.");
          setEdSaving(false); return;
        }
        patch.photo_path = path;
        patch.photo_position_x = edX; patch.photo_position_y = edY; patch.photo_zoom = edZoom;
      } else if (!edPhotoPath && household?.photo_path) {
        // Photo removed in this session: null the row + reset framing, delete object.
        patch.photo_path = null;
        patch.photo_position_x = 50; patch.photo_position_y = 50; patch.photo_zoom = 100;
        removedPath = household.photo_path;
      } else if (edPhotoPath) {
        // Existing photo kept: persist any reframing.
        patch.photo_position_x = edX; patch.photo_position_y = edY; patch.photo_zoom = edZoom;
      }
      const ok = await updateHouseholdBanner(patch);
      if (!ok) { setEdSaving(false); return; }
      if (removedPath) {
        try { await supabase.storage.from("household-photos").remove([removedPath]); } catch (_e) {}
      }
      await refreshHouseholds();   // name change propagates to the switcher list
      showToast("Saved");
      closeEditHousehold();
    } finally {
      setEdSaving(false);
    }
  };

  const shoppingList = useMemo(() => {
    // Group directly from the RPC rows (listRows) — the source of truth that is
    // identical on every client. catalogMap is no longer in the display path,
    // so a stale/incomplete local catalog can never drop a synced item.
    const groups = {}; // rawCategory -> items[]
    for (const row of listRows) {
      if ((row.quantity || 0) <= 0) continue;
      const rawCat = row.category || "Household";
      const realPrice = prices[row.name] && supabasePrices[row.name]
        ? prices[row.name]
        : (localPrices[row.name] || 0);
      // added_by is a stale scalar — set once at row creation and never updated, so a
      // remove→re-add can leave it naming a user who is no longer the contributor.
      // Derive the name-line from the contributor ledger instead (the source of truth).
      const contributors = contributorsMap?.[row.name] || [];
      const soleContributor = contributors.length === 1 ? contributors[0] : null;
      const isOwnItem = !soleContributor || soleContributor.clerkId === user?.id;
      if (!groups[rawCat]) groups[rawCat] = [];
      groups[rawCat].push({
        name: row.name, catalogItemId: row.catalogItemId, listItemId: row.id, qty: row.quantity,
        price: realPrice,
        subtotal: (row.quantity || 0) * realPrice,
        category: CATEGORY_DISPLAY[rawCat] || rawCat,
        isOwnItem,
        contributors,
      });
    }

    const orderedRaw = [
      ...CATEGORY_ORDER.filter(c => groups[c]),
      ...Object.keys(groups).filter(c => !CATEGORY_ORDER.includes(c)),
    ];

    return orderedRaw.map(rawCat => ({
      category: CATEGORY_DISPLAY[rawCat] || rawCat,
      items: groups[rawCat].sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [listRows, prices, supabasePrices, localPrices, contributorsMap, user?.id]);

  const pendingItems = shoppingList.flatMap(cat =>
    cat.items.filter(item => !checked[item.name])
  );
  const boughtItems = shoppingList.flatMap(cat =>
    cat.items.filter(item => checked[item.name])
  );

  // Loading state for catalog — only true while fetch is in flight, not based on result size
  const catalogLoading = loading;

  const totalItems = shoppingList.reduce((acc, c) => acc + c.items.length, 0);
  const totalCost = shoppingList.reduce((acc, c) => acc + c.items.reduce((a, i) => a + i.subtotal, 0), 0);
  const hasEstimatedPrices = shoppingList.some(c => c.items.some(i => !prices[i.name]));
  const checkedCount = Object.values(checked).filter(Boolean).length;
  const checkedCost = shoppingList.reduce((acc, c) =>
    acc + c.items.reduce((a, i) => a + (checked[i.name] ? i.subtotal : 0), 0), 0);

  // Shop declutter phase 2 — flat A–Z of unchecked items (checked are always hidden once decluttered).
  const shopFlatItems = useMemo(() =>
    shoppingList
      .flatMap(c => c.items)
      .filter(i => !checked[i.name])
      .sort((a, b) => a.name.localeCompare(b.name)),
    [shoppingList, checked]);

 
  const budgetRemaining = budgetNum !== null ? budgetNum - totalCost : null;
  const budgetPct = budgetNum !== null ? Math.min((totalCost / budgetNum) * 100, 100) : null;
  const overBudget = budgetNum !== null && totalCost > budgetNum;

  // ── OurBanner header state (migration 024) ──
  // Photo-gated by construction: no photoUrl → today's espresso header and no
  // banner control (spec D3). photoUrl is a signed URL resolved on switch, so it
  // swaps the instant activeHouseholdId changes — no stale frame (spec: swap).
  const bannerPhotoUrl = isSignedIn ? (household?.photoUrl || null) : null;
  const bannerHasPhoto = !!bannerPhotoUrl;
  // Dormancy (spec): wordmark choice persists even with no photo, but only takes
  // effect when a photo exists; with no photo the wordmark always renders large.
  const bannerWordmark = bannerHasPhoto ? (household?.banner_wordmark || "large") : "large";
  const bannerX = household?.photo_position_x ?? 50;
  const bannerY = household?.photo_position_y ?? 50;
  const bannerZoom = household?.photo_zoom ?? 100;
  // Band scrim: darkens the two horizontal strips that are always type (top bar,
  // wordmark base) and leaves the middle clear — assumes nothing about the photo.
  const BAND_SCRIM = "linear-gradient(to bottom," +
    "rgba(0,0,0,0.86) 0%,rgba(0,0,0,0.52) 16%,rgba(0,0,0,0.04) 34%," +
    "rgba(0,0,0,0.04) 62%,rgba(0,0,0,0.58) 84%,rgba(0,0,0,0.88) 100%)";
  // Full-region gradient for the live header: spans the header AND the nav strip
  // as one continuous background so the photo dissolves into the tabs with no
  // hard seam. Top is the abyss band for the wordmark; the bottom ramps into
  // solid espresso (#2C1A0E) so the tabs keep full contrast where it's opaque.
  const BANNER_DISSOLVE = "linear-gradient(to bottom," +
    "rgba(2,15,26,0.55) 0%,rgba(2,15,26,0) 22%,rgba(2,15,26,0) 46%," +
    "rgba(44,26,14,0.72) 74%,#2C1A0E 100%)";
  const CHROME_SHADOW = bannerHasPhoto ? "0 1px 6px rgba(0,0,0,0.9)" : "none";
  const WORDMARK_SHADOW = bannerHasPhoto ? "0 2px 14px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.7)" : "none";

  return (
      <div style={{ fontFamily: "'Georgia', serif", minHeight: "100vh", background: "#FAF4EC", color: "#2C1A0E" }}>
      {/* ready (§5): Clerk auth resolved, and — if signed in — household/provisions
          loaded. Signed-out has nothing to load, so it's ready once auth resolves. */}
      {showSplash && <SplashScreen onDone={handleSplashDone} ready={isLoaded && (!isSignedIn || !loading)} headerTitleRef={headerTitleRef} />}

      {/* Loading overlay — shown while Supabase bootstraps after sign-in */}
      {isSignedIn && loading && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(250,244,236,0.88)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 50, backdropFilter: "blur(2px)",
        }}>
          <div style={{
            fontFamily: "'Lato', sans-serif", fontSize: "0.8rem", letterSpacing: "2px",
            textTransform: "uppercase", color: "#8a7a60",
          }}>Loading your provisions…</div>
        </div>
      )}

      {/* Connectivity pill */}
      <ConnectivityPill />

      {/* Error toast */}
      {error && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          background: "#2C1A0E", color: "#FAF4EC", borderRadius: "8px",
          padding: "12px 20px", display: "flex", alignItems: "center", gap: "14px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.25)", zIndex: 200,
          fontFamily: "'Lato', sans-serif", fontSize: "0.82rem", maxWidth: "90vw",
        }}>
          <span>⚠ {error}</span>
          <button onClick={dismissError} style={{
            background: "none", border: "1px solid rgba(255,255,255,0.3)", color: "#FAF4EC",
            borderRadius: "4px", padding: "3px 10px", cursor: "pointer", fontSize: "0.75rem",
          }}>Dismiss</button>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Lato:wght@300;400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root { --op-list-scale: 1; }
        body { background: #FAF4EC; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .header { background: #2C1A0E; color: #FAF4EC; position: relative; }
        .header h1 { font-size: 42px; letter-spacing: 0.02em; }
        .tab-bar { display: flex; background: #2C1A0E; border-bottom: 3px solid #c8973a; }
        .tab { flex: 1; padding: 8px 4px 10px; text-align: center; cursor: pointer; font-family: 'Lato', sans-serif; font-size: 0.7rem; letter-spacing: 2px; text-transform: uppercase; background: none; border: none; color: #C9A97A; border-bottom: 2px solid transparent; display: flex; flex-direction: column; align-items: center; gap: 4px; transition: opacity 0.2s; }
        .tab.active { border-bottom: 2px solid #C9A97A; }
        .tab-content { display: flex; flex-direction: column; align-items: center; gap: 4px; opacity: 0.5; transition: opacity 0.2s; }
        .tab.active .tab-content { opacity: 1; }
        .badge { display: inline-block; background: #E8A838; color: white; font-weight: 700; border-radius: 10px; padding: 1px 7px; font-size: 0.7rem; margin-left: 6px; font-family: 'Lato', sans-serif; }
        .container { max-width: 680px; margin: 0 auto; padding: 24px 16px; }

        /* Budget banner */
        .budget-banner { background: #2C1A0E; color: #FAF4EC; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; max-width: 100%; border-bottom: 2px solid #c8973a; gap: 12px; }
        .budget-banner.over { border-bottom-color: #e05c5c; }
        .budget-label { font-family: 'Lato', sans-serif; font-size: 0.75rem; letter-spacing: 2px; text-transform: uppercase; color: #c8b89a; }
        .budget-amount { font-family: 'Playfair Display', serif; font-size: 1.6rem; font-weight: 700; color: #c8973a; }
        .budget-amount.over { color: #e05c5c; }
        .budget-items { font-family: 'Lato', sans-serif; font-size: 0.8rem; color: #c8b89a; margin-top: 2px; }
        .budget-goal-section { text-align: right; }
        .budget-goal-label { font-family: 'Lato', sans-serif; font-size: 0.7rem; letter-spacing: 1.5px; text-transform: uppercase; color: #c8b89a; }
        .budget-goal-remaining { font-family: 'Playfair Display', serif; font-size: 1.1rem; font-weight: 700; margin-top: 2px; }
        .budget-goal-remaining.ok { color: #A0724A; }
        .budget-goal-remaining.over { color: #e05c5c; }
        .budget-bar-wrap { width: 100%; height: 4px; background: rgba(255,255,255,0.15); border-radius: 2px; margin-top: 6px; overflow: hidden; }
        .budget-bar-fill { height: 100%; border-radius: 2px; transition: width 0.4s ease, background 0.3s; }
        .set-budget-btn { font-family: 'Lato', sans-serif; font-size: 0.7rem; letter-spacing: 1px; text-transform: uppercase; padding: 5px 10px; border: 1px solid #c8b89a; background: transparent; color: #c8b89a; cursor: pointer; border-radius: 4px; transition: all 0.2s; white-space: nowrap; }
        .set-budget-btn:hover { border-color: #c8973a; color: #c8973a; }

        .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .hint { font-family: 'Lato', sans-serif; font-size: 0.8rem; color: #8a7a60; letter-spacing: 0.5px; }
        .add-item-btn { font-family: 'Lato', sans-serif; font-size: 0.78rem; letter-spacing: 1px; text-transform: uppercase; padding: 8px 14px; background: #A0724A; color: #FAF4EC; border: none; border-radius: 5px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
        .add-item-btn:hover { background: #6B4423; }
        .category-block { margin-bottom: 28px; }
        .cat-title { font-family: 'Lato', sans-serif; font-size: 0.72rem; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: #A0724A; border-bottom: 2px solid #E8D5B7; padding-bottom: 8px; margin-bottom: 12px; }
        .items-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        @media(max-width: 520px) { .items-grid { grid-template-columns: 1fr; } }
        .item-row { display: flex; flex-direction: column; background: #F5EDE0; border: 1.5px solid #E8D5B7; border-radius: 8px; padding: 10px 12px; transition: border-color 0.2s, box-shadow 0.2s; gap: 8px; user-select: none; -webkit-tap-highlight-color: transparent; }
        @media (hover: hover) { .item-row:hover { border-color: #c8973a; box-shadow: 0 2px 8px rgba(200,151,58,0.15); } }
        .item-row.has-qty { border-color: #c8973a; background: #FAF4EC; }
        .item-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }
        .item-name { font-family: 'Lato', sans-serif; font-size: calc(0.88rem * var(--op-list-scale)); color: #2C1A0E; flex: 1; }
        .qty-controls { display: inline-flex; align-items: center; background: transparent; border: 1px solid #C9A97A; border-radius: 999px; overflow: hidden; flex-shrink: 0; }
        .qty-btn { width: 38px; height: 34px; border: 0; background: transparent; color: #A0724A; font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center; font-family: 'Lato', sans-serif; line-height: 1; transition: background 0.12s; }
        .qty-btn:active { background: #F5EDE0; }
        .qty-display { font-family: 'Playfair Display', serif; font-size: 1rem; font-weight: 700; min-width: 30px; text-align: center; color: #2C1A0E; border-left: 1px solid #C9A97A; border-right: 1px solid #C9A97A; padding: 8px 0; }
        .qty-display.zero { color: #c8b89a; font-weight: 400; }
        .add-btn { border: 1px solid #C9A97A; background: transparent; color: #A0724A; font-family: 'Lato', sans-serif; font-weight: 700; font-size: 0.9rem; letter-spacing: 0.02em; padding: 9px 22px; border-radius: 999px; cursor: pointer; transition: all 0.14s; }
        .add-btn:active { background: #A0724A; border-color: #A0724A; color: #fff; }
        @media (hover: hover) { .add-btn:hover { background: #A0724A; border-color: #A0724A; color: #fff; } }
        .price-row { display: flex; align-items: center; gap: 8px; }
        .price-display { font-family: 'Lato', sans-serif; font-size: calc(0.78rem * var(--op-list-scale)); color: #8a7a60; }
        .price-edit-wrap { display: flex; align-items: center; gap: 4px; width: 100%; }
        .price-input { font-family: 'Lato', sans-serif; font-size: 0.82rem; border: 1.5px solid #c8973a; border-radius: 4px; padding: 3px 6px; width: 70px; color: #2C1A0E; background: #F5EDE0; outline: none; }
        .price-save-btn { font-family: 'Lato', sans-serif; font-size: 0.7rem; background: #c8973a; color: white; border: none; border-radius: 3px; padding: 4px 8px; cursor: pointer; }
        .item-subtotal { font-family: 'Lato', sans-serif; font-size: calc(0.75rem * var(--op-list-scale)); color: #c8973a; font-weight: 700; text-align: right; }
        .list-empty { text-align: center; padding: 60px 20px; }
        .list-empty h2 { font-family: 'Playfair Display', serif; font-size: 1.5rem; color: #8a7a60; }
        .list-empty p { font-family: 'Lato', sans-serif; color: #a89878; margin-top: 8px; font-size: 0.9rem; }
        .list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 10px; }
        .cat-toggle { background: none; border: none; cursor: pointer; padding: 4px 6px; border-radius: 4px; display: flex; align-items: center; gap: 5px; font-family: 'Lato', sans-serif; font-size: 0.68rem; letter-spacing: 1px; text-transform: uppercase; transition: opacity 0.2s; }
        .cat-toggle:hover { opacity: 0.7; }
        .list-progress { font-family: 'Lato', sans-serif; font-size: 0.8rem; color: #8a7a60; letter-spacing: 1px; text-transform: uppercase; }
        .cyc-ico { flex: none; width: 46px; height: 46px; border-radius: 11px; display: flex; align-items: center; justify-content: center; border: 1px solid #E8D5B7; background: #fff; color: #A0724A; cursor: pointer; padding: 0; transition: background 0.18s, border-color 0.18s, color 0.18s; }
        .cyc-ico.on { background: #A0724A; border-color: #A0724A; color: #fff; }
        .cyc-ico svg { width: 22px; height: 22px; display: block; }
        .wrapup { flex: none; display: flex; align-items: center; justify-content: center; border: 1px solid #E8D5B7; background: #fff; border-radius: 11px; height: 48px; padding: 0 18px; font-family: 'Lato', sans-serif; font-size: 0.9rem; font-weight: 700; letter-spacing: 0.2px; color: #2C1A0E; cursor: pointer; white-space: nowrap; transition: border-color 0.2s; }
        .wrapup:hover { border-color: #A0724A; }
        .declutter-desc { font-family: 'Lato', sans-serif; font-size: 0.72rem; color: #a9967c; font-style: italic; letter-spacing: 0.3px; margin: -8px 0 14px; }
        .flat-header { font-family: 'Lato', sans-serif; font-size: 0.7rem; letter-spacing: 2.5px; text-transform: uppercase; color: #8a7a60; margin-top: 12px; padding-bottom: 6px; }
        .progress-bar { height: 4px; background: #E8D5B7; border-radius: 2px; margin-bottom: 24px; overflow: hidden; }
        .progress-fill { height: 100%; background: #A0724A; border-radius: 2px; transition: width 0.4s ease; }
        .list-cat-title { font-family: 'Lato', sans-serif; font-size: 0.7rem; letter-spacing: 2.5px; text-transform: uppercase; color: #c8973a; margin-bottom: 0; margin-top: 28px; padding-bottom: 6px; border-bottom: 2px solid #c8973a; }
        .list-item { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 14px 4px; background: transparent; border: none; border-bottom: 1px solid #E8D5B7; transition: all 0.2s; user-select: none; -webkit-tap-highlight-color: transparent; }
        .list-item.done { opacity: 0.45; }
        .list-item.done .li-name { text-decoration: line-through; color: #a89878; }
        .checkbox { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #c8b89a; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; cursor: pointer; }
        .checkbox.checked { background: #c8973a; border-color: #c8973a; }
        .checkmark { color: white; font-size: 0.7rem; font-weight: bold; }
        .li-name { font-family: 'Lato', sans-serif; font-size: calc(0.95rem * var(--op-list-scale)); flex: 1; cursor: pointer; }
        .li-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
        .li-qty { font-family: 'Lato', sans-serif; font-size: calc(0.75rem * var(--op-list-scale)); color: #8a7a60; }
        .li-subtotal { font-family: 'Playfair Display', serif; font-size: calc(0.95rem * var(--op-list-scale)); color: #c8973a; font-weight: 700; }
        .li-subtotal.done { color: #a89878; }
        .clear-btn { font-family: 'Lato', sans-serif; font-size: 0.75rem; letter-spacing: 1px; text-transform: uppercase; padding: 8px 16px; border: 1.5px solid #c8b89a; background: transparent; color: #8a7a60; cursor: pointer; border-radius: 4px; transition: all 0.2s; }
        .clear-btn:hover { border-color: #e05c5c; color: #e05c5c; }
        .all-done { text-align: center; padding: 20px; }
        .all-done p { font-family: 'Playfair Display', serif; font-size: 1.2rem; color: #c8973a; }
        .list-total { background: #F5EDE0; border: 2px solid #c8973a; border-radius: 10px; padding: 16px 18px; margin-top: 24px; display: flex; justify-content: space-between; align-items: center; }
        .list-total.over { border-color: #e05c5c; }
        .lt-left .lt-label { font-family: 'Lato', sans-serif; font-size: 0.8rem; letter-spacing: 1px; text-transform: uppercase; color: #8a7a60; }
        .lt-amount { font-family: 'Playfair Display', serif; font-size: 1.6rem; font-weight: 700; color: #2C1A0E; }
        .lt-amount.over { color: #e05c5c; }
        .lt-checked { font-family: 'Lato', sans-serif; font-size: 0.78rem; color: #8a7a60; margin-top: 4px; }
        .lt-budget-row { font-family: 'Lato', sans-serif; font-size: 0.78rem; margin-top: 6px; font-weight: 700; }
        .lt-budget-row.ok { color: #4a9e4a; }
        .lt-budget-row.over { color: #e05c5c; }

        /* Modals */
        .modal-overlay { position: fixed; inset: 0; background: rgba(44,26,14,0.55); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
        .modal { background: #FAF4EC; border-radius: 12px; padding: 28px 24px; width: 100%; max-width: 420px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        .modal h2 { font-family: 'Playfair Display', serif; font-size: 1.4rem; font-weight: 700; color: #2C1A0E; margin-bottom: 8px; }
        .modal-subtitle { font-family: 'Lato', sans-serif; font-size: 0.82rem; color: #8a7a60; margin-bottom: 20px; }
        .modal-field { margin-bottom: 16px; }
        .modal-label { font-family: 'Lato', sans-serif; font-size: 0.75rem; letter-spacing: 1.5px; text-transform: uppercase; color: #8a7a60; margin-bottom: 6px; display: block; }
        .modal-input { width: 100%; font-family: 'Lato', sans-serif; font-size: 0.95rem; border: 1.5px solid #E8D5B7; border-radius: 6px; padding: 9px 12px; color: #2C1A0E; background: #F5EDE0; outline: none; transition: border-color 0.2s; }
        .modal-input:focus { border-color: #c8973a; }
        .modal-input-prefix { display: flex; align-items: center; border: 1.5px solid #E8D5B7; border-radius: 6px; background: #F5EDE0; overflow: hidden; transition: border-color 0.2s; }
        .modal-input-prefix:focus-within { border-color: #c8973a; }
        .modal-prefix-symbol { font-family: 'Lato', sans-serif; font-size: 0.95rem; color: #8a7a60; padding: 9px 0 9px 12px; }
        .modal-input-inner { flex: 1; font-family: 'Lato', sans-serif; font-size: 0.95rem; border: none; padding: 9px 12px; color: #2C1A0E; background: transparent; outline: none; }
        .modal-select { width: 100%; font-family: 'Lato', sans-serif; font-size: 0.95rem; border: 1.5px solid #E8D5B7; border-radius: 6px; padding: 9px 12px; color: #2C1A0E; background: #F5EDE0; outline: none; cursor: pointer; }
        .modal-error { font-family: 'Lato', sans-serif; font-size: 0.8rem; color: #e05c5c; margin-bottom: 12px; }
        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }
        .modal-actions-spaced { display: flex; gap: 10px; justify-content: space-between; align-items: center; margin-top: 8px; }
        .modal-cancel { font-family: 'Lato', sans-serif; font-size: 0.8rem; padding: 9px 18px; border: 1.5px solid #c8b89a; background: transparent; color: #8a7a60; cursor: pointer; border-radius: 5px; transition: all 0.2s; }
        .modal-cancel:hover { border-color: #2C1A0E; color: #2C1A0E; }
        .modal-confirm { font-family: 'Lato', sans-serif; font-size: 0.8rem; padding: 9px 18px; background: #A0724A; color: #FAF4EC; border: none; cursor: pointer; border-radius: 5px; transition: all 0.2s; }
        .modal-confirm:hover { background: #c8973a; }
        .modal-remove { font-family: 'Lato', sans-serif; font-size: 0.8rem; padding: 9px 18px; border: 1.5px solid #e8d5d5; background: transparent; color: #e05c5c; cursor: pointer; border-radius: 5px; transition: all 0.2s; }
        .modal-remove:hover { background: #fff0f0; border-color: #e05c5c; }
      `}</style>

      {/* OurBanner region — when a photo exists, the header AND the nav strip share
          ONE continuous photo+gradient background (this wrapper), so the image
          dissolves into the tabs with no hard seam. Photo-less: this wrapper is an
          inert relative box and the header + nav keep their solid espresso, exactly
          as before. The layer spans the wrapper's flow height = header + nav (the
          modals in between are position:fixed and contribute no height). */}
      <div style={{ position: "relative" }}>
        {bannerHasPhoto && (
          <>
            <div aria-hidden="true" style={{
              position: "absolute", inset: 0, zIndex: 0,
              backgroundColor: "#2C1A0E",
              backgroundImage: `url("${bannerPhotoUrl}")`,
              backgroundSize: `${bannerZoom}% auto`,
              backgroundPosition: `${bannerX}% ${bannerY}%`,
              backgroundRepeat: "no-repeat",
            }} />
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, background: BANNER_DISSOLVE }} />
          </>
        )}
      <div className="header" style={{ position: "relative", zIndex: bannerHasPhoto ? 1 : undefined, background: bannerHasPhoto ? "transparent" : undefined }}>
        {/* Row 1: Velayo bar — avatar left, three dots right, household centered */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "calc(10px + env(safe-area-inset-top)) 16px 10px", minHeight: "44px", boxSizing: "border-box", background: bannerHasPhoto ? "transparent" : "#1a0e06" }}>
          {isSignedIn && household?.name && (
            <button
              onClick={() => setShowHouseholdModal(true)}
              aria-label="Manage household"
              style={{
                position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                background: "none", border: "none", padding: "4px 8px", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: "6px", maxWidth: "55%",
                fontFamily: "'Lato', sans-serif", fontSize: "13px", textTransform: "uppercase",
                letterSpacing: "0.6px", color: bannerHasPhoto ? "#FAF4EC" : "#C9A97A", whiteSpace: "nowrap", overflow: "hidden",
                fontWeight: bannerHasPhoto ? 700 : undefined,
                textShadow: CHROME_SHADOW,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, opacity: bannerHasPhoto ? 0.8 : 0.5, marginInline: "3px" }}>
                <circle cx="12" cy="5" r="2.4" stroke="#C9A97A" strokeWidth="1.6"/>
                <path d="M12 7.4V21" stroke="#C9A97A" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M6 11h12" stroke="#C9A97A" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M3 13c0 5 4 7 9 7s9-2 9-7" stroke="#C9A97A" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{household.name}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, opacity: bannerHasPhoto ? 0.8 : 0.5, marginInline: "3px", transform: "scaleX(-1)" }}>
                <circle cx="12" cy="5" r="2.4" stroke="#C9A97A" strokeWidth="1.6"/>
                <path d="M12 7.4V21" stroke="#C9A97A" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M6 11h12" stroke="#C9A97A" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M3 13c0 5 4 7 9 7s9-2 9-7" stroke="#C9A97A" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
          )}
          <div>
            {isSignedIn ? (
              <button
                onClick={() => setShowProfileSheet(true)}
                style={{
                  width: "32px", height: "32px", borderRadius: "50%",
                  background: "#0D9488", border: "2px solid #0D9488",
                  color: "white", fontFamily: "'Lato', sans-serif",
                  fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0
                }}
                aria-label="Open profile"
              >
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </button>
            ) : !isLoaded ? (
              // Clerk not loaded yet: render the buttons immediately (no layout
              // shift) but DISABLED, so a click can't hit a not-yet-wired modal
              // trigger. On a cold load the SignInButton/SignUpButton modal handlers
              // aren't live until Clerk finishes; showing them enabled produced dead
              // buttons until a refresh. Same dimensions as the live buttons below —
              // only cursor + opacity differ. Swaps to live once isLoaded is true.
              <div style={{ display: "flex", gap: "8px" }}>
                <button disabled style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.75rem", letterSpacing: "1px", textTransform: "uppercase", padding: "6px 14px", background: "transparent", border: "1px solid rgba(255,255,255,0.4)", color: "white", borderRadius: "4px", cursor: "default", opacity: 0.5 }}>Sign In</button>
                <button disabled style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.75rem", letterSpacing: "1px", textTransform: "uppercase", padding: "6px 14px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)", color: "white", borderRadius: "4px", cursor: "default", opacity: 0.5 }}>Sign Up</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px" }}>
                <SignInButton mode="modal">
                  <button style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.75rem", letterSpacing: "1px", textTransform: "uppercase", padding: "6px 14px", background: "transparent", border: "1px solid rgba(255,255,255,0.4)", color: "white", borderRadius: "4px", cursor: "pointer" }}>Sign In</button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.75rem", letterSpacing: "1px", textTransform: "uppercase", padding: "6px 14px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)", color: "white", borderRadius: "4px", cursor: "pointer" }}>Sign Up</button>
                </SignUpButton>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowVelayoMenu(true)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
            aria-label="Velayo menu"
          >
            <svg width="28" height="24" viewBox="0 0 28 24" fill="none">
              <circle cx="5" cy="4" r="3.5" fill="#C9A97A"/>
              <circle cx="14" cy="16" r="3.5" fill="#C9A97A"/>
              <circle cx="23" cy="4" r="3.5" fill="#C9A97A"/>
            </svg>
          </button>
        </div>

        {/* Row 2: OurProvisions wordmark band. Over a photo it obeys the
            household's banner_wordmark: large (default), small (~⅔, ~80%), or
            hidden (not rendered — the middle band is photo only, spec D4). The
            band keeps its height when hidden so the photo has room to breathe. */}
        <div style={{
          position: "relative", zIndex: 1,
          padding: bannerWordmark === "small" ? "16px 16px" : "20px 16px",
          textAlign: "center",
          background: bannerHasPhoto ? "transparent" : "#2C1A0E",
          minHeight: bannerHasPhoto ? "64px" : undefined,
          boxSizing: "border-box",
        }}>
          {bannerWordmark === "hidden" ? null : (
            <h1 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: bannerWordmark === "small" ? "28px" : "42px",
              letterSpacing: "0.02em", color: "#FAF4EC", fontWeight: 400, margin: 0,
              opacity: bannerWordmark === "small" ? 0.8 : 1,
              textShadow: WORDMARK_SHADOW,
              transform: bannerHasPhoto ? "translateY(-5%)" : "none",
            }}>
              {/* §8: always "OurProvisions" (tight, matching the splash wordmark and
                  the reference) so the splash hands off to the same words — no more
                  bare "Provisions" for single-member households. The button is the
                  measured hand-off target (headerTitleRef). */}
              <button
                ref={headerTitleRef}
                onClick={() => isSignedIn ? setShowHouseholdModal(true) : null}
                style={{ background: "none", border: "none", padding: 0, cursor: isSignedIn ? "pointer" : "default", color: "inherit", font: "inherit" }}
              >
                <span style={{ fontWeight: 400, fontStyle: "italic" }}>Our</span><span style={{ fontWeight: 700, fontStyle: "italic" }}>Provisions</span>
              </button>
            </h1>
          )}
        </div>
      </div>

      {/* Velayo app menu */}
      {showVelayoMenu && (
        <div
          onClick={() => setShowVelayoMenu(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FAF4EC", borderRadius: "16px", padding: "32px 28px 28px",
              width: "min(340px, 90vw)", boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: "24px",
            }}
          >
            {/* Menu header */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <img src={VELAYO_LOGO_TEAL} alt="Velayo" style={{ width: "48px", height: "48px", objectFit: "contain" }} />
              <div style={{
                fontFamily: "'Lato', sans-serif", fontSize: "0.65rem", letterSpacing: "2.5px",
                textTransform: "uppercase", color: "#8a7a60",
              }}>Live Better. Live Smarter.</div>
            </div>

            {/* App list */}
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={() => setShowVelayoMenu(false)}
                style={{
                  width: "100%", background: "#2C1A0E", border: "2px solid #c8973a",
                  borderRadius: "10px", padding: "14px 18px",
                  display: "flex", alignItems: "center", gap: "14px",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: "'Playfair Display', serif", fontSize: "1.1rem",
                    color: "#FAF4EC", fontWeight: 700,
                  }}>
                    <span style={{ fontWeight: 400 }}>Our</span>Provisions
                  </div>
                </div>
                <div style={{
                  fontFamily: "'Lato', sans-serif", fontSize: "0.6rem", letterSpacing: "1.5px",
                  textTransform: "uppercase", color: "#c8973a", fontWeight: 700,
                }}>Active</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage household sheet — two zones: Your Households (entity CRUD) above,
          {household} · Members (membership detail) below. One selection drives both;
          the membership zone recomputes on active-household switch. */}
      {showHouseholdModal && (
        <div
          onClick={() => {
            setShowHouseholdModal(false);
            setCreating(false); setNewHouseholdName("");
          }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FAF4EC", borderRadius: "16px", padding: "28px 24px 24px",
              width: "min(360px, 92vw)", maxHeight: "85vh", overflowY: "auto",
              boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
              display: "flex", flexDirection: "column", gap: "22px",
            }}
          >

            {/* ── Zone 1: Your Households (name-only rows; bare pencil on the active row) ── */}
            <div>
              <div style={{
                fontFamily: "'Lato', sans-serif", fontSize: "0.6rem", letterSpacing: "2.5px",
                textTransform: "uppercase", color: "#A0724A", marginBottom: "10px",
              }}>Your Households</div>
              {(myHouseholds || []).map((hh) => {
                const isActive = hh.id === activeHouseholdId;
                if (isActive) {
                  // Active row: espresso fill + clay ring carry selection; a bare pencil
                  // at the right edge opens Edit. Tapping the row also opens Edit.
                  return (
                    <button
                      key={hh.id}
                      onClick={openEditHousehold}
                      aria-label={`Edit ${hh.name}`}
                      style={{
                        width: "100%", background: "#2C1A0E", border: "2px solid #c8973a",
                        borderRadius: "8px", padding: "11px 14px",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        cursor: "pointer", marginBottom: "6px", boxSizing: "border-box", textAlign: "left",
                      }}
                    >
                      <span style={{
                        fontFamily: "'Lato', sans-serif", fontSize: "0.95rem",
                        color: "#FAF4EC", fontWeight: 700,
                      }}>{hh.name}</span>
                      {/* Bare pencil + "Edit" label (no container/plate), per FINAL3 */}
                      <span style={{
                        display: "flex", alignItems: "center", gap: "6px", flexShrink: 0,
                        fontFamily: "'Lato', sans-serif", fontSize: "13.5px", fontWeight: 700,
                        color: "#FAF4EC", opacity: 0.82,
                      }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FAF4EC"
                          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                        </svg>
                        Edit
                      </span>
                    </button>
                  );
                }
                return (
                  <button
                    key={hh.id}
                    onClick={() => { switchHousehold(hh.id); setShowHouseholdModal(false); }}
                    style={{
                      width: "100%", background: "#E8D5B7", border: "2px solid transparent",
                      borderRadius: "8px", padding: "11px 14px",
                      display: "flex", alignItems: "center",
                      cursor: "pointer", marginBottom: "6px", boxSizing: "border-box", textAlign: "left",
                    }}
                  >
                    <span style={{
                      fontFamily: "'Lato', sans-serif", fontSize: "0.95rem",
                      color: "#2C1A0E", fontWeight: 400,
                    }}>{hh.name}</span>
                  </button>
                );
              })}

              {/* Create new household — below the list */}
              {!creating ? (
                <button
                  onClick={() => setCreating(true)}
                  style={{
                    width: "100%", background: "none", border: "1.5px dashed #A0724A",
                    borderRadius: "8px", padding: "11px 14px", marginTop: "2px",
                    fontFamily: "'Lato', sans-serif", fontSize: "0.85rem", color: "#A0724A",
                    cursor: "pointer", textAlign: "center", boxSizing: "border-box",
                  }}
                >+ Create new household</button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "2px" }}>
                  <input
                    autoFocus
                    value={newHouseholdName}
                    onChange={(e) => setNewHouseholdName(e.target.value)}
                    placeholder="Household name"
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: "8px",
                      border: "1.5px solid #A0724A", fontFamily: "'Lato', sans-serif",
                      fontSize: "0.9rem", boxSizing: "border-box", background: "#FAF4EC",
                    }}
                  />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => { setCreating(false); setNewHouseholdName(""); }}
                      style={{
                        flex: 1, padding: "10px", background: "#E8D5B7", border: "none",
                        borderRadius: "8px", fontFamily: "'Lato', sans-serif",
                        fontSize: "0.8rem", cursor: "pointer", color: "#2C1A0E",
                      }}
                    >Cancel</button>
                    <button
                      disabled={creatingInFlight}
                      onClick={async () => {
                        if (creatingInFlight) return;            // guard: ignore taps while in flight
                        const n = newHouseholdName.trim();
                        if (!n) return;
                        setCreatingInFlight(true);               // raise BEFORE the await
                        try {
                          const newId = await createHousehold(n);
                          if (newId) {
                            await refreshHouseholds();
                            switchHousehold(newId);
                            setShowHouseholdModal(false);
                            setCreating(false); setNewHouseholdName("");
                            showToast(`"${n}" created`);
                          }
                        } finally {
                          setCreatingInFlight(false);            // clear on every exit path
                        }
                      }}
                      style={{
                        flex: 2, padding: "10px",
                        background: creatingInFlight ? "#C9A87E" : "#A0724A",
                        border: "none", borderRadius: "8px", fontFamily: "'Lato', sans-serif",
                        fontSize: "0.8rem", fontWeight: 700,
                        cursor: creatingInFlight ? "default" : "pointer", color: "#FAF4EC",
                      }}
                    >{creatingInFlight ? "Creating…" : "Create"}</button>
                  </div>
                </div>
              )}
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #f0e6d8", margin: 0 }} />

            {/* ── Zone 2: {household} · Members (roster + Invite; no count, no monogram) ── */}
            <div>
              <div style={{
                fontFamily: "'Lato', sans-serif", fontSize: "0.6rem", letterSpacing: "2.5px",
                textTransform: "uppercase", color: "#A0724A", marginBottom: "14px",
              }}>{(household?.name || "This household")} · Members</div>

              {/* Member list */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {householdMembers.map((m) => {
                  const clerkId = m.users?.clerk_id;
                  const isMe = clerkId === user?.id;
                  const displayName = m.users?.full_name
                    || (m.users?.email ? m.users.email.split("@")[0] : (isMe ? "You" : "Member"));
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {isMe && user.imageUrl ? (
                        <img src={user.imageUrl} alt={displayName} style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover" }} />
                      ) : (
                        <div style={{
                          width: "36px", height: "36px", borderRadius: "50%",
                          background: "#E8D5B7", display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: "'Lato', sans-serif", fontSize: "0.85rem", fontWeight: 700, color: "#8a7a60",
                        }}>
                          {displayName[0].toUpperCase()}
                        </div>
                      )}
                      <span style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.9rem", color: "#2C1A0E", flex: 1 }}>
                        {displayName}
                      </span>
                      {isMe && (
                        <span style={{
                          fontFamily: "'Lato', sans-serif", fontSize: "0.6rem", letterSpacing: "1px",
                          textTransform: "uppercase", color: "#8a7a60",
                          background: "#E8D5B7", borderRadius: "4px", padding: "2px 7px",
                        }}>you</span>
                      )}
                      {!isMe && m.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(m)}
                          title="Remove member"
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "#b08968", padding: "4px", display: "flex", alignItems: "center",
                            borderRadius: "4px",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#8a3a2a'; e.currentTarget.style.background = '#f0e3d0'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = '#b08968'; e.currentTarget.style.background = 'none'; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Invite → OS share sheet (spec D5). No in-app share UI. */}
              <button
                onClick={handleInviteShare}
                disabled={invitePreparing}
                style={{
                  width: "100%", fontFamily: "'Lato', sans-serif", fontSize: "0.8rem",
                  letterSpacing: "1px", textTransform: "uppercase", padding: "12px",
                  background: invitePreparing ? "#6ba3a0" : "#2f7d7a", color: "#FAF4EC", border: "none",
                  borderRadius: "8px", cursor: invitePreparing ? "default" : "pointer", marginTop: "16px",
                }}
              >{invitePreparing ? "Preparing…" : "+ Invite someone aboard"}</button>

              {/* Leaving is a membership action (you removing yourself) → it lives in
                  the membership zone, for non-creators. Delete (the entity action) is
                  creator-only and lives inside Edit household (spec D3/D4). */}
              {!isHouseholdCreator && (
                <button
                  onClick={() => handleLeaveHousehold()}
                  style={{
                    width: "100%", fontFamily: "'Lato', sans-serif", fontSize: "0.78rem",
                    letterSpacing: "0.5px", padding: "10px",
                    background: "none", color: "#b08968", border: "none",
                    cursor: "pointer", marginTop: "10px",
                  }}
                >Leave household</button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Edit household sheet (OurBanner) — photo framing + wordmark + name, then
          the creator-only Delete danger zone. One Save commits everything. */}
      {showEditHousehold && (
        <div
          onClick={closeEditHousehold}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            zIndex: 1100, animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FAF4EC", borderRadius: "18px 18px 0 0", padding: 0,
              width: "min(440px, 100vw)", maxHeight: "94vh", overflowY: "auto",
              boxShadow: "0 -12px 40px rgba(0,0,0,0.4)",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Hidden file input MUST live inside this stopPropagation container.
                edFileInputRef.current.click() dispatches a synthetic click on the
                input that bubbles to the ancestor with onClick; if the input sat
                directly under the backdrop, that bubbled click would fire
                closeEditHousehold and unmount the sheet mid-pick — the upload path
                (and its errors) would never run. */}
            <input
              ref={edFileInputRef}
              type="file"
              accept="image/*"
              onClick={(e) => e.stopPropagation()}
              onChange={onEdPickFile}
              style={{ display: "none" }}
            />
            {/* Header: Cancel · title · Save */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 10px" }}>
              <button onClick={closeEditHousehold} style={{ background: "none", border: "none", color: "#A0724A", fontFamily: "'Lato', sans-serif", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.05rem", color: "#2C1A0E" }}>Edit household</div>
              <button
                onClick={saveEditHousehold}
                disabled={edSaving}
                style={{ background: edSaving ? "#6ba3a0" : "#2f7d7a", border: "none", color: "#FAF4EC", fontFamily: "'Lato', sans-serif", fontSize: "0.9rem", fontWeight: 900, borderRadius: "10px", padding: "8px 16px", cursor: edSaving ? "default" : "pointer" }}
              >{edSaving ? "Saving…" : "Save"}</button>
            </div>

            <div style={{ padding: "4px 18px 20px" }}>
              {/* Live preview — the control (spec D7). Drag to reposition when a
                  photo exists; empty state shows the real espresso header. */}
              <div
                onPointerDown={onEdDragStart}
                onPointerMove={onEdDragMove}
                onPointerUp={onEdDragEnd}
                onPointerCancel={onEdDragEnd}
                style={{
                  position: "relative", height: "130px", borderRadius: "14px", overflow: "hidden",
                  background: "#2C1A0E",
                  backgroundImage: edHasPhoto && edPreviewUrl ? `url("${edPreviewUrl}")` : "none",
                  backgroundSize: `${edZoom}% auto`,
                  backgroundPosition: `${edX}% ${edY}%`,
                  backgroundRepeat: "no-repeat",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: edHasPhoto ? "grab" : "default",
                  touchAction: "none", userSelect: "none",
                }}
              >
                {edHasPhoto && (
                  <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: BAND_SCRIM }} />
                )}
                {/* Empty state renders the real espresso header → wordmark large,
                    ignoring the dormant choice (spec D3/D8). With a photo it obeys
                    the draft banner_wordmark. */}
                {(() => {
                  const pw = edHasPhoto ? edWordmark : "large";
                  if (pw === "hidden") return null;
                  return (
                    <div style={{
                      position: "relative",
                      fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700,
                      color: "#FAF4EC",
                      fontSize: pw === "small" ? "18px" : "26px",
                      opacity: pw === "small" ? 0.8 : 1,
                      textShadow: edHasPhoto ? "0 2px 14px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.7)" : "none",
                      transform: edHasPhoto ? "translateY(-5%)" : "none",
                      pointerEvents: "none",
                    }}>OurProvisions</div>
                  );
                })()}
              </div>

              {edHasPhoto ? (
                <div style={{ fontSize: "0.7rem", color: "#9a8a78", textAlign: "center", margin: "8px 0 0" }}>
                  Drag to reposition
                </div>
              ) : (
                <button
                  onClick={() => edFileInputRef.current && edFileInputRef.current.click()}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "9px", width: "100%",
                    background: "#2C1A0E", color: "#FAF4EC", border: "none", borderRadius: "14px", padding: "14px",
                    fontFamily: "'Lato', sans-serif", fontSize: "0.9rem", fontWeight: 900, cursor: "pointer", marginTop: "14px",
                  }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FAF4EC" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h4l2-2h6l2 2h4v12H3z"/><circle cx="12" cy="13" r="3.5"/></svg>
                  Choose a photo
                </button>
              )}

              {/* Photo controls — only when a photo exists (spec D3) */}
              {edHasPhoto && (
                <>
                  <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.6rem", fontWeight: 900, letterSpacing: "1.5px", textTransform: "uppercase", color: "#A0724A", margin: "18px 0 8px" }}>Zoom</div>
                  <input
                    type="range" min="100" max="320" value={edZoom}
                    onChange={(e) => setEdZoom(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />

                  <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                    <button
                      onClick={() => edFileInputRef.current && edFileInputRef.current.click()}
                      style={{ flex: 1, background: "#FBF7F0", border: "1px solid rgba(44,26,14,0.10)", borderRadius: "12px", padding: "12px", fontFamily: "'Lato', sans-serif", fontSize: "0.82rem", fontWeight: 700, color: "#2C1A0E", cursor: "pointer" }}
                    >Replace photo</button>
                    <button
                      onClick={onEdRemovePhoto}
                      style={{ flex: 1, background: "#FBF7F0", border: "1px solid rgba(44,26,14,0.10)", borderRadius: "12px", padding: "12px", fontFamily: "'Lato', sans-serif", fontSize: "0.82rem", fontWeight: 700, color: "#2C1A0E", cursor: "pointer" }}
                    >Remove photo</button>
                  </div>

                  <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.6rem", fontWeight: 900, letterSpacing: "1.5px", textTransform: "uppercase", color: "#A0724A", margin: "18px 0 8px" }}>Wordmark</div>
                  <div style={{ display: "flex", background: "#FBF7F0", border: "1px solid rgba(44,26,14,0.10)", borderRadius: "12px", overflow: "hidden" }}>
                    {["large", "small", "hidden"].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setEdWordmark(opt)}
                        style={{
                          flex: 1, background: edWordmark === opt ? "#2C1A0E" : "none", border: "none",
                          padding: "11px", fontFamily: "'Lato', sans-serif", fontSize: "0.8rem", fontWeight: 700,
                          color: edWordmark === opt ? "#FAF4EC" : "#8a7660", cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                      >{opt}</button>
                    ))}
                  </div>
                </>
              )}

              {/* Household name */}
              <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.6rem", fontWeight: 900, letterSpacing: "1.5px", textTransform: "uppercase", color: "#A0724A", margin: "18px 0 8px" }}>Household name</div>
              <input
                value={edName}
                onChange={(e) => setEdName(e.target.value)}
                style={{ width: "100%", background: "#FBF7F0", border: "1px solid rgba(44,26,14,0.10)", borderRadius: "12px", padding: "13px 14px", fontFamily: "'Lato', sans-serif", fontSize: "0.95rem", color: "#2C1A0E", boxSizing: "border-box" }}
              />

              <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.72rem", color: "#9a8a78", lineHeight: 1.5, margin: "12px 2px 0" }}>
                Anyone in the household can change the photo, the name, and the wordmark.
              </div>

              {/* Creator-only Delete danger zone (spec D3/D4) */}
              {isHouseholdCreator && (
                <div style={{ marginTop: "22px", paddingTop: "16px", borderTop: "1px solid rgba(44,26,14,0.10)" }}>
                  {!edDeleteConfirm ? (
                    <button
                      onClick={() => setEdDeleteConfirm(true)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "9px", width: "100%",
                        background: "none", border: "1.5px solid rgba(179,38,30,0.4)", borderRadius: "14px", padding: "14px",
                        color: "#c0392b", fontFamily: "'Lato', sans-serif", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
                      Delete household
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => setEdDeleteConfirm(false)}
                        style={{ flex: 1, background: "#E8D5B7", border: "none", borderRadius: "12px", padding: "13px", fontFamily: "'Lato', sans-serif", fontSize: "0.82rem", color: "#2C1A0E", cursor: "pointer" }}
                      >Cancel</button>
                      <button
                        onClick={handleDeleteHousehold}
                        style={{ flex: 2, background: "#c0392b", border: "none", borderRadius: "12px", padding: "13px", fontFamily: "'Lato', sans-serif", fontSize: "0.82rem", fontWeight: 700, color: "#fff", cursor: "pointer" }}
                      >Yes, delete household</button>
                    </div>
                  )}
                  <div style={{ fontSize: "0.7rem", color: "#9a8a78", textAlign: "center", marginTop: "8px", lineHeight: 1.4 }}>
                    Deletes {household?.name || "this household"} for everyone aboard. This can't be undone.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div style={{
          position: "fixed", bottom: "28px", left: "50%", transform: "translateX(-50%)",
          background: "rgba(44,26,14,0.92)", color: "#FAF4EC",
          fontFamily: "'Lato', sans-serif", fontSize: "0.85rem",
          padding: "10px 22px", borderRadius: "999px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
          zIndex: 2000, whiteSpace: "nowrap",
          animation: "fadeIn 0.18s ease",
        }}>
          {toastMessage}
        </div>
      )}

      {/* Join success banner */}
      {joinBanner && (
        <div style={{
          position: "relative", zIndex: 1,
          background: "#4a9e4a", color: "white", padding: "12px 20px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontFamily: "'Lato', sans-serif", fontSize: "0.85rem",
        }}>
          <span>🎉 You joined <strong>{joinBanner}</strong>! Your list is now shared.</span>
          <button onClick={() => setJoinBanner(null)} style={{
            background: "none", border: "none", color: "white", fontSize: "1.1rem", cursor: "pointer",
          }}>×</button>
        </div>
      )}

      {/* Invite is a system-share hand-off (handleInviteShare) — no in-app share
          UI. The old self-rendered panel + "Copy link instead" are removed. */}

      {/* Nav strip. Over a photo its solid #2C1A0E is dropped so the wrapper's
          gradient (which ends at solid espresso here) carries the background — no
          separate opaque block, no seam. Tab colors are unchanged; text-shadows
          become load-bearing where the strip is still translucent. */}
      <div className="tab-bar" style={bannerHasPhoto ? { position: "relative", zIndex: 1, background: "transparent" } : undefined}>

        {/* Plan tab — horizon icon */}
        <button className={`tab ${view === "plan" ? "active" : ""}`} onClick={() => setView("plan")} style={{ textShadow: CHROME_SHADOW, ...(bannerHasPhoto ? { color: view === "plan" ? "#FAF4EC" : "#C9A97A", fontWeight: view === "plan" ? 700 : undefined } : {}) }}>
          <span className="tab-content" style={bannerHasPhoto ? { opacity: view === "plan" ? 1 : 0.85 } : undefined}>
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="9" cy="5" r="2" fill="currentColor"/>
            <line x1="9" y1="1" x2="9" y2="0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="12.5" y1="2.5" x2="13.5" y2="1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="5.5" y1="2.5" x2="4.5" y2="1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="14" y1="5" x2="15.5" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="4" y1="5" x2="2.5" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M1 9 Q9 4 17 9" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            <line x1="0" y1="11" x2="18" y2="11" stroke="currentColor" strokeWidth="0.75" strokeLinecap="round" opacity="0.5"/>
          </svg>
          Plan
          </span>
        </button>

        {/* Browse tab — grid icon */}
        <button className={`tab ${view === "input" ? "active" : ""}`} onClick={() => setView("input")} style={{ textShadow: CHROME_SHADOW, ...(bannerHasPhoto ? { color: view === "input" ? "#FAF4EC" : "#C9A97A", fontWeight: view === "input" ? 700 : undefined } : {}) }}>
          <span className="tab-content" style={bannerHasPhoto ? { opacity: view === "input" ? 1 : 0.85 } : undefined}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          Browse
          </span>
        </button>

        {/* Shop tab — basket icon */}
        <button className={`tab ${view === "list" ? "active" : ""}`} onClick={() => setView("list")} style={{ textShadow: CHROME_SHADOW, ...(bannerHasPhoto ? { color: view === "list" ? "#FAF4EC" : "#C9A97A", fontWeight: view === "list" ? 700 : undefined } : {}) }}>
          <span className="tab-content" style={bannerHasPhoto ? { opacity: view === "list" ? 1 : 0.85 } : undefined}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 7 Q6 3 9 3 Q12 3 12 7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            <path d="M2 7 L3.5 15 Q5 16.5 9 16.5 Q13 16.5 14.5 15 L16 7 Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
            <line x1="2.5" y1="10.5" x2="15.5" y2="10.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
          </svg>
          Shop
          </span>
          {totalItems > 0 && <span className="badge">{totalItems}</span>}
        </button>

      </div>
      </div>{/* /OurBanner region wrapper */}

      {showPrices && totalItems > 0 && (
        <div className={`budget-banner ${overBudget ? "over" : ""}`}>
          <div style={{ flex: 1 }}>
            <div className="budget-label">Estimated Total</div>
            <div className={`budget-amount ${overBudget ? "over" : ""}`}>{hasEstimatedPrices ? "~" : ""}${totalCost.toFixed(2)}</div>
            <div className="budget-items">{totalItems} item{totalItems !== 1 ? "s" : ""} selected</div>
            {budgetNum !== null && (
              <div className="budget-bar-wrap">
                <div
                  className="budget-bar-fill"
                  style={{
                    width: `${budgetPct}%`,
                    background: overBudget ? "#e05c5c" : budgetPct > 85 ? "#C9A97A" : "#A0724A"
                  }}
                />
              </div>
            )}
          </div>
          <div className="budget-goal-section">
            {budgetNum !== null ? (
              <>
                <div className="budget-goal-label">Budget</div>
                <div className={`budget-goal-remaining ${overBudget ? "over" : "ok"}`}>
                  {overBudget
                    ? `−$${Math.abs(budgetRemaining).toFixed(2)} over`
                    : `$${budgetRemaining.toFixed(2)} left`}
                </div>
                <div style={{ marginTop: "4px" }}>
                  <button className="set-budget-btn" onClick={openBudgetModal}>
                    ${budgetNum.toFixed(0)} goal ✎
                  </button>
                </div>
              </>
            ) : (
              <button className="set-budget-btn" onClick={openBudgetModal}>+ Set Budget</button>
            )}
          </div>
        </div>
      )}

      {showPrices && totalItems === 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 20px", background: "#2C1A0E", borderBottom: "2px solid #c8973a" }}>
          <button className="set-budget-btn" onClick={openBudgetModal}>
            {budgetNum !== null ? `Budget: $${budgetNum.toFixed(0)} ✎` : "+ Set Budget"}
          </button>
        </div>
      )}

      <div className="container">
        {view === "plan" && (
          <div style={{ padding: "40px 20px", textAlign: "center", minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: "1.3rem", color: "#8a7a60" }}>
              Plan coming soon.
            </p>
            <p style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.8rem", color: "#C9A97A", marginTop: "8px", letterSpacing: "1px" }}>
              Meal planning &amp; AI list builder
            </p>
          </div>
        )}

        {view === "input" && (
          <>
            {/* ── Search bar — sticky at top ── */}
            <div style={{
              padding: "12px 0 10px",
              background: "#FAF4EC",
              position: "sticky",
              top: 0,
              zIndex: 10,
              borderBottom: "1px solid #E8D5B7",
              marginBottom: "12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{
                  flex: 1, minWidth: 0,
                  display: "flex", alignItems: "center",
                  background: "#F5EDE0",
                  border: `1.5px solid ${searchQuery ? "#A0724A" : "#E8D5B7"}`,
                  borderRadius: "12px",
                  padding: "0 12px", gap: "8px", height: "46px",
                  boxShadow: searchQuery ? "0 0 0 3px rgba(160,114,74,0.12)" : "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}>
                  <span style={{ color: "#C9A97A", fontSize: "15px", flexShrink: 0 }}>🔍</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setSearchPickerOpen(false); }}
                    placeholder="Search your catalog…"
                    style={{
                      flex: 1, minWidth: 0, border: "none", background: "none",
                      fontFamily: "'Lato', sans-serif", fontSize: "15px",
                      color: "#2C1A0E", outline: "none",
                    }}
                  />
                  {searchQuery && (
                    <span
                      onClick={() => { setSearchQuery(""); setSearchPickerOpen(false); }}
                      style={{ color: "#C9A97A", fontSize: "16px", cursor: "pointer", opacity: 0.7, flexShrink: 0 }}
                    >✕</span>
                  )}
                </div>
                <CycleIcon phase={browsePhase} onAdvance={() => setBrowsePhase((browsePhase + 1) % 3)} />
              </div>
            </div>

            {/* ── Filter chips — wrapping; hidden when decluttered (phase 1/2) ── */}
            {browsePhase === 0 && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: "7px",
              paddingBottom: "14px",
            }}>
              {/* Staples — cross-cutting filter */}
              <button
                onClick={() => setStapleFilter(f => !f)}
                style={{
                  padding: "5px 13px", borderRadius: "20px",
                  fontFamily: "'Lato', sans-serif", fontSize: "0.72rem", letterSpacing: "0.4px",
                  whiteSpace: "nowrap", cursor: "pointer",
                  background: stapleFilter ? "#c8973a" : "#F5EDE0",
                  color: stapleFilter ? "white" : "#6B4423",
                  border: `1px solid ${stapleFilter ? "#c8973a" : "#E8D5B7"}`,
                  transition: "all 0.15s",
                }}
              >⭐ Staples</button>

              {/* Category chips — toggle to filter */}
              {categories.map(cat => {
                const isActive = selectedCategories.has(cat.rawName);
                return (
                  <button
                    key={cat.rawName}
                    onClick={() => {
                      setSelectedCategories(prev => {
                        const next = new Set(prev);
                        if (next.has(cat.rawName)) {
                          next.delete(cat.rawName);
                        } else {
                          next.add(cat.rawName);
                        }
                        return next;
                      });
                    }}
                    style={{
                      padding: "5px 13px", borderRadius: "20px",
                      fontFamily: "'Lato', sans-serif", fontSize: "0.72rem", letterSpacing: "0.4px",
                      whiteSpace: "nowrap", cursor: "pointer",
                      background: isActive ? "#A0724A" : "#F5EDE0",
                      color: isActive ? "white" : "#6B4423",
                      border: `1px solid ${isActive ? "#A0724A" : "#E8D5B7"}`,
                      transition: "all 0.15s",
                    }}
                  >{cat.name}</button>
                );
              })}
            </div>
            )}
            {browsePhase !== 0 && (
              <div className="declutter-desc" style={{ margin: "0 0 14px" }}>
                {browseFilterCount > 0
                  ? `${browseFilterCount} filter${browseFilterCount === 1 ? "" : "s"} active · filters hidden`
                  : "filters hidden"}
              </div>
            )}

            {/* ── Catalog body ── */}
            {catalogLoading ? (
              <div style={{ textAlign: "center", padding: "40px 20px", fontFamily: "'Lato', sans-serif", fontSize: "0.85rem", color: "#8a7a60", letterSpacing: "1px" }}>
                Loading your catalog…
              </div>
            ) : searchResults !== null ? (
              /* ── SEARCH MODE ── */
              <div>
                {searchResults.length > 0 ? (
                  <>
                    <div style={{ padding: "0 0 8px", fontFamily: "'Lato', sans-serif", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#C9A97A" }}>
                      {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for "{searchQuery}"
                    </div>
                    <div className="items-grid">
                      {searchResults.map(item => {
                        const qty = quantities[item.name] || 0;
                        const rawFallback = categoryAvgPrices[item.rawCategory] || 3.00;
                        const price = prices[item.name] || (Math.round(rawFallback * 2) / 2);
                        const isEditing = editingPrice === item.name;
                        const isStaple = catalogMap[item.name]?.is_staple;
                        const isCustom = catalogMap[item.name]?.is_global === false;
                        // Catalog items only expose price editing — nothing to edit when pricing is off.
                        const canEdit = isCustom || showPrices;
                        return (
                          <SwipeToRemove key={item.name} onRemove={() => hideItem(item.name)} onEdit={() => openEditModal(item.name)} onStaple={() => toggleStaple(item.name)} isStaple={isStaple} canEdit={canEdit}>
                            <CatalogItemRow
                              item={item}
                              qty={qty}
                              rawCategory={item.rawCategory}
                              showPrices={showPrices}
                              price={price}
                              isEditing={isEditing}
                              priceInput={priceInput}
                              centsToDisplay={centsToDisplay}
                              onUpdateQty={updateQty}
                              onPriceInput={handlePriceInput}
                              onCommitPrice={commitPrice}
                              onCancelEditPrice={() => setEditingPrice(null)}
                            />
                          </SwipeToRemove>
                        );
                      })}
                    </div>
                  </>
                ) : hiddenLiveMatch ? (
                  /* ── HIDDEN-BUT-LIVE: reveal only, never touch the shared quantity ── */
                  <>
                    <div style={{ padding: "0 0 8px", fontFamily: "'Lato', sans-serif", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#C9A97A" }}>
                      On your list — hidden from your view
                    </div>
                    <div
                      onClick={() => { unhideItem(hiddenLiveMatch.item.id); setSearchQuery(""); }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        borderRadius: "10px", border: "1.5px solid #C9A97A",
                        background: "rgba(201,169,122,0.06)", padding: "12px 14px",
                        marginBottom: "6px", cursor: "pointer",
                      }}
                    >
                      <div>
                        <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "14px", color: "#A0724A" }}>
                          <strong>{hiddenLiveMatch.item.name}</strong> ×{hiddenLiveMatch.qty}
                        </div>
                        <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "10px", color: "#C9A97A", marginTop: "2px" }}>
                          Hidden from your view — tap to reveal
                        </div>
                      </div>
                      <span style={{ color: "#A0724A", fontSize: "18px" }}>↺</span>
                    </div>
                  </>
                ) : (
                  /* ── NO MATCH: inline add with category picker ── */
                  <>
                    <div style={{ padding: "0 0 8px", fontFamily: "'Lato', sans-serif", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#C9A97A" }}>
                      No results for "{searchQuery}"
                    </div>
                    <div style={{
                      borderRadius: "10px",
                      border: "1.5px dashed #C9A97A",
                      background: "rgba(201,169,122,0.06)",
                      overflow: "hidden",
                      marginBottom: "6px",
                    }}>
                      {!searchPickerOpen ? (
                        <div
                          onClick={() => setSearchPickerOpen(true)}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", cursor: "pointer" }}
                        >
                          <div>
                            <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "14px", color: "#A0724A" }}>
                              Add <strong>"{searchQuery}"</strong> to your list
                            </div>
                            <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "10px", color: "#C9A97A", marginTop: "2px" }}>
                              Tap to choose a category
                            </div>
                          </div>
                          <button className="add-btn" style={{ flexShrink: 0 }}>Add</button>
                        </div>
                      ) : (
                        <div>
                          <div
                            onClick={() => setSearchPickerOpen(false)}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 8px", cursor: "pointer" }}
                          >
                            <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "14px", color: "#A0724A" }}>
                              Add <strong>"{searchQuery}"</strong> to your list
                            </div>
                            <span style={{ color: "#C9A97A", fontSize: "18px" }}>−</span>
                          </div>
                          <div style={{ padding: "0 14px 4px", fontFamily: "'Lato', sans-serif", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#C9A97A" }}>
                            Where does it belong?
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", padding: "0 14px 10px" }}>
                            {categories.filter(cat => cat.rawName !== "⭐ My Custom Items").map(cat => (
                              <button
                                key={cat.rawName}
                                onClick={() => addSearchedItem(cat.rawName)}
                                style={{
                                  padding: "6px 14px", borderRadius: "20px",
                                  fontFamily: "'Lato', sans-serif", fontSize: "12px",
                                  cursor: "pointer",
                                  border: "1px solid #E8D5B7",
                                  background: "#F5EDE0", color: "#6B4423",
                                  transition: "all 0.15s",
                                }}
                              >{cat.name}</button>
                            ))}
                          </div>
                          {/* ── New category inline input ── */}
                          <div style={{ padding: "0 14px 14px" }}>
                            <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#C9A97A", marginBottom: "7px" }}>
                              Or create a new category
                            </div>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                              <input
                                type="text"
                                value={newCategoryInput}
                                onChange={e => setNewCategoryInput(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter" && newCategoryInput.trim()) {
                                    const newCat = newCategoryInput.trim();
                                    setHouseholdCategories(prev => new Set([...prev, newCat]));
                                    addSearchedItem(newCat);
                                  }
                                }}
                                placeholder="e.g. Pet Supplies"
                                style={{
                                  flex: 1, border: "1.5px solid #E8D5B7", borderRadius: "20px",
                                  padding: "6px 14px", fontFamily: "'Lato', sans-serif", fontSize: "12px",
                                  color: "#2C1A0E", background: "#F5EDE0", outline: "none",
                                }}
                              />
                              <button
                                onClick={() => {
                                  if (!newCategoryInput.trim()) return;
                                  const newCat = newCategoryInput.trim();
                                  setHouseholdCategories(prev => new Set([...prev, newCat]));
                                  addSearchedItem(newCat);
                                }}
                                style={{
                                  width: "30px", height: "30px", borderRadius: "50%",
                                  background: newCategoryInput.trim() ? "#A0724A" : "#E8D5B7",
                                  border: "none", color: "white",
                                  fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center",
                                  cursor: newCategoryInput.trim() ? "pointer" : "default",
                                  flexShrink: 0, transition: "background 0.15s",
                                }}
                              >+</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* ── NORMAL BROWSE MODE ── */
              <>
                {browsePhase === 2 ? (
                  /* ── FLAT A–Z (declutter phase 2) ── */
                  <>
                    <FlatHeader count={browseFlatItems.length} />
                    <div className="items-grid">
                      {browseFlatItems.map((item) => {
                        const qty = quantities[item.name] || 0;
                        const rawFallback = categoryAvgPrices[item.rawCategory] || 3.00;
                        const price = prices[item.name] || (Math.round(rawFallback * 2) / 2);
                        const isEditing = editingPrice === item.name;
                        const isStaple = catalogMap[item.name]?.is_staple;
                        const isCustom = catalogMap[item.name]?.is_global === false;
                        // Catalog items only expose price editing — nothing to edit when pricing is off.
                        const canEdit = isCustom || showPrices;
                        return (
                          <SwipeToRemove key={item.name} onRemove={() => hideItem(item.name)} onEdit={() => openEditModal(item.name)} onStaple={() => toggleStaple(item.name)} isStaple={isStaple} canEdit={canEdit}>
                            <CatalogItemRow
                              item={item}
                              qty={qty}
                              rawCategory={item.rawCategory}
                              showPrices={showPrices}
                              price={price}
                              isEditing={isEditing}
                              priceInput={priceInput}
                              centsToDisplay={centsToDisplay}
                              onUpdateQty={updateQty}
                              onPriceInput={handlePriceInput}
                              onCommitPrice={commitPrice}
                              onCancelEditPrice={() => setEditingPrice(null)}
                            />
                          </SwipeToRemove>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  displayCategories.map((cat) => (
                  <div className="category-block" key={cat.name}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #E8D5B7", paddingBottom: "8px", marginBottom: "12px" }}>
                      <div className="cat-title" style={{ border: "none", padding: 0, margin: 0 }}>{cat.name}</div>
                      <button
                        onClick={() => {
                          setNewItemCategory(cat.rawName);
                          setShowAddModal(true);
                        }}
                        style={{
                          background: "none", border: "none", fontFamily: "'Lato', sans-serif",
                          fontSize: "0.72rem", color: "#A0724A", cursor: "pointer",
                          letterSpacing: "0.5px", padding: "0",
                        }}
                      >＋ Add item</button>
                    </div>
                    <div className="items-grid">
                      {cat.items.map((item) => {
                        const qty = quantities[item.name] || 0;
                        const rawFallback = categoryAvgPrices[cat.rawName] || 3.00;
                        const price = prices[item.name] || (Math.round(rawFallback * 2) / 2);
                        const isEditing = editingPrice === item.name;
                        const isStaple = catalogMap[item.name]?.is_staple;
                        const isCustom = catalogMap[item.name]?.is_global === false;
                        // Catalog items only expose price editing — nothing to edit when pricing is off.
                        const canEdit = isCustom || showPrices;
                        return (
                          <SwipeToRemove key={item.name} onRemove={() => hideItem(item.name)} onEdit={() => openEditModal(item.name)} onStaple={() => toggleStaple(item.name)} isStaple={isStaple} canEdit={canEdit}>
                            <CatalogItemRow
                              item={item}
                              qty={qty}
                              rawCategory={cat.rawName}
                              showPrices={showPrices}
                              price={price}
                              isEditing={isEditing}
                              priceInput={priceInput}
                              centsToDisplay={centsToDisplay}
                              onUpdateQty={updateQty}
                              onPriceInput={handlePriceInput}
                              onCommitPrice={commitPrice}
                              onCancelEditPrice={() => setEditingPrice(null)}
                            />
                          </SwipeToRemove>
                        );
                      })}
                    </div>
                  </div>
                  ))
                )}
                <div style={{ textAlign: "center", padding: "32px 0 16px" }}>
                  <button
                    onClick={() => setShowManageCategoriesModal(true)}
                    style={{
                      background: "none", border: "none", fontFamily: "'Lato', sans-serif",
                      fontSize: "0.75rem", color: "#A0724A", cursor: "pointer",
                      letterSpacing: "1px", textDecoration: "underline",
                    }}
                  >Manage Categories</button>
                </div>
              </>
            )}
          </>
        )}

        {view === "list" && (
          <>
            {totalItems === 0 ? (
              <div className="list-empty">
                <h2>Your list is empty</h2>
                <p>Go to "Add Items" and set quantities for what you need.</p>
              </div>
            ) : (
              <>
                <div className="list-header">
                  <span className="list-progress" style={{ flex: 1 }}>{checkedCount} of {totalItems} checked</span>
                  {activeCycle && <span style={{display:'none'}}>{activeCycle.id}</span>}
                  <CycleIcon phase={shopPhase} onAdvance={() => setShopPhase((shopPhase + 1) % 3)} />
                  <button
                    className="wrapup"
                    onClick={() => {
                      // Pre-select all pending items for roll-forward
                      const pending = new Set(
                        shoppingList.flatMap(cat =>
                          cat.items.filter(i => !checked[i.name]).map(i => i.name)
                        )
                      );
                      setWrapUpRollItems(pending);
                      setShowWrapUpModal(true);
                    }}
                  >
                    Wrap up
                  </button>
                </div>
                {shopPhase !== 0 && (
                  <div className="declutter-desc">
                    {checkedCount > 0
                      ? `${checkedCount} checked ${checkedCount === 1 ? "item" : "items"} hidden`
                      : "no checked items yet"}
                  </div>
                )}
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(checkedCount / totalItems) * 100}%` }} />
                </div>
                {checkedCount === totalItems && totalItems > 0 && (
                  <div className="all-done" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                    <p style={{ margin: 0 }}>🎉 All done!</p>
                    <button
                      onClick={() => {
                        setWrapUpRollItems(new Set()); // nothing to roll — all bought
                        setShowWrapUpModal(true);
                      }}
                      style={{
                        fontFamily: "'Lato', sans-serif",
                        fontSize: "0.7rem",
                        letterSpacing: "1px",
                        textTransform: "uppercase",
                        padding: "5px 12px",
                        border: "1px solid #0D9488",
                        background: "#0D9488",
                        color: "white",
                        cursor: "pointer",
                        borderRadius: "4px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Wrap Up Trip →
                    </button>
                  </div>
                )}
                {shopPhase !== 2 ? (
                  shoppingList.map((cat) => {
                    // Phase 1 hides checked items; skip a category that empties out.
                    const catItems = shopPhase === 1 ? cat.items.filter(i => !checked[i.name]) : cat.items;
                    if (catItems.length === 0) return null;
                    return (
                    <div key={cat.category}>
                      <div className="list-cat-title">{cat.category}</div>
                      {catItems.map((item) => {
                        const isDone = checked[item.name];
                        return (
                          <SwipeToRemove key={item.name} onRemove={() => handleSwipeRemove(item)} removeLabel="Remove" style={{ borderRadius: 0, background: "transparent" }}>
                            <div className={`list-item ${isDone ? "done" : ""}`}>
                              <div className={`checkbox ${isDone ? "checked" : ""}`} onClick={() => toggleChecked(item.name, item.listItemId)}>
                                {isDone && <span className="checkmark">✓</span>}
                              </div>
                              <div style={{ flex: 1, cursor: "pointer" }} onClick={() => toggleChecked(item.name, item.listItemId)}>
                                <div className="li-name" style={{ textDecoration: checked[item.name] ? "line-through" : "none" }}>
                                  {item.name}
                                </div>
                                {item.contributors?.length > 1 && (
                                  <div style={{ display: "flex", gap: "3px", marginTop: "4px" }}>
                                    {item.contributors.map((c, i) => {
                                      const initials = c.fullName
                                        ? c.fullName.trim()[0].toUpperCase()
                                        : "?";
                                      const isMe = c.clerkId === user?.id;
                                      return (
                                        <span key={i} title={c.fullName || "Unknown"} style={{
                                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                                          width: "20px", height: "20px", borderRadius: "50%",
                                          fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.02em",
                                          background: isMe ? "#A0724A" : "#C9A97A",
                                          color: "#FAF4EC",
                                          border: "1.5px solid #FAF4EC",
                                          opacity: 0.9,
                                        }}>
                                          {initials}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                                {item.contributors?.length === 1 && !item.isOwnItem && item.contributors[0].fullName && (
                                  <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.65rem", letterSpacing: "1px", color: "#C9A97A", opacity: 0.85, marginTop: "2px" }}>
                                    {item.contributors[0].fullName}
                                  </div>
                                )}
                              </div>
                              {item.qty > 1 && (
                                <span className="li-qty">×{item.qty}</span>
                              )}
                              {showPrices && item.price > 0 && (
                                <div className="li-right">
                                  <span className="li-qty">@ ${item.price.toFixed(2)}</span>
                                  <span className={`li-subtotal ${isDone ? "done" : ""}`}>${item.subtotal.toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          </SwipeToRemove>
                        );
                      })}
                    </div>
                    );
                  })
                ) : (
                  <div>
                    <FlatHeader count={shopFlatItems.length} />
                    {shopFlatItems
                      .map((item) => {
                        const isDone = checked[item.name];
                        return (
                          <SwipeToRemove key={item.name} onRemove={() => handleSwipeRemove(item)} removeLabel="Remove" style={{ borderRadius: 0, background: "transparent" }}>
                            <div className={`list-item ${isDone ? "done" : ""}`}>
                              <div className={`checkbox ${isDone ? "checked" : ""}`} onClick={() => toggleChecked(item.name, item.listItemId)}>
                                {isDone && <span className="checkmark">✓</span>}
                              </div>
                              <div style={{ flex: 1, cursor: "pointer" }} onClick={() => toggleChecked(item.name, item.listItemId)}>
                                <div className="li-name" style={{ textDecoration: checked[item.name] ? "line-through" : "none" }}>
                                  {item.name}
                                </div>
                                {item.contributors?.length > 1 && (
                                  <div style={{ display: "flex", gap: "3px", marginTop: "4px" }}>
                                    {item.contributors.map((c, i) => {
                                      const initials = c.fullName
                                        ? c.fullName.trim()[0].toUpperCase()
                                        : "?";
                                      const isMe = c.clerkId === user?.id;
                                      return (
                                        <span key={i} title={c.fullName || "Unknown"} style={{
                                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                                          width: "20px", height: "20px", borderRadius: "50%",
                                          fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.02em",
                                          background: isMe ? "#A0724A" : "#C9A97A",
                                          color: "#FAF4EC",
                                          border: "1.5px solid #FAF4EC",
                                          opacity: 0.9,
                                        }}>
                                          {initials}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                                {item.contributors?.length === 1 && !item.isOwnItem && item.contributors[0].fullName && (
                                  <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.65rem", letterSpacing: "1px", color: "#C9A97A", opacity: 0.85, marginTop: "2px" }}>
                                    {item.contributors[0].fullName}
                                  </div>
                                )}
                              </div>
                              {item.qty > 1 && (
                                <span className="li-qty">×{item.qty}</span>
                              )}
                              {showPrices && item.price > 0 && (
                                <div className="li-right">
                                  <span className="li-qty">@ ${item.price.toFixed(2)}</span>
                                  <span className={`li-subtotal ${isDone ? "done" : ""}`}>${item.subtotal.toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          </SwipeToRemove>
                        );
                      })}
                  </div>
                )}
                {showPrices && (
                <div className={`list-total ${overBudget ? "over" : ""}`}>
                  <div className="lt-left">
                    <div className="lt-label">Trip Total</div>
                    {checkedCount > 0 && (
                      <div className="lt-checked">${checkedCost.toFixed(2)} in cart · ${(totalCost - checkedCost).toFixed(2)} remaining</div>
                    )}
                    {budgetNum !== null && (
                      <div className={`lt-budget-row ${overBudget ? "over" : "ok"}`}>
                        {overBudget
                          ? `⚠ $${Math.abs(budgetRemaining).toFixed(2)} over your $${budgetNum.toFixed(2)} budget`
                          : `✓ $${budgetRemaining.toFixed(2)} under your $${budgetNum.toFixed(2)} budget`}
                      </div>
                    )}
                  </div>
                  <div className={`lt-amount ${overBudget ? "over" : ""}`}>{hasEstimatedPrices ? "~" : ""}${totalCost.toFixed(2)}</div>
                </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Velayo footer — only shown when there are items */}
      {totalItems > 0 && (
        <div style={{
          textAlign: "center", padding: "28px 20px 36px",
          borderTop: "1px solid #E8D5B7", marginTop: "12px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "10px",
        }}>
          <img src={VELAYO_LOGO_TEAL} alt="Velayo" style={{ width: "72px", height: "auto", opacity: 0.55 }} />
          <div style={{
            fontFamily: "'Lato', sans-serif", fontSize: "0.6rem", letterSpacing: "2px",
            textTransform: "uppercase", color: "#b0a080", opacity: 0.7,
          }}>A Velayo App</div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add New Item</h2>
            <div className="modal-field">
              <label className="modal-label">Item Name</label>
              <input className="modal-input" placeholder="e.g. Kombucha" value={newItemName} autoFocus
                onChange={(e) => setNewItemName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddItem()} />
            </div>
            {showPrices && (
            <div className="modal-field" style={{ opacity: newItemName.trim() ? 1 : 0.4, transition: "opacity 0.15s" }}>
              <label className="modal-label">Price ($)</label>
              <input className="modal-input" type="text" inputMode="numeric" placeholder="0.00" value={centsToDisplay(newItemPrice)}
                onChange={(e) => newItemName.trim() && setNewItemPrice(e.target.value.replace(/\D/g, "").replace(/^0+/, "") || "")} onKeyDown={(e) => e.key === "Enter" && handleAddItem()} />
            </div>
            )}
            <div className="modal-field">
              <label className="modal-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Category</span>
                {isSignedIn && !newItemName.trim() && hiddenCatalogItems.some(h => h.category === newItemCategory) && (
                  <span style={{ fontStyle: "italic", fontSize: "10px", color: "#C9A97A", fontWeight: 400 }}>tap below to unhide</span>
                )}
              </label>
              <select className="modal-select" value={newItemCategory}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setShowManageCategoriesModal(true);
                  } else {
                    setNewItemCategory(e.target.value);
                    setAddModalResetDone(false);
                  }
                }}>
                {categories.map(cat => (
                  <option key={cat.rawName} value={cat.rawName}>{cat.name}</option>
                ))}
              </select>
              {isSignedIn && !newItemName.trim() && (
                addModalResetDone ? (
                  <div style={{ fontSize: "12px", color: "#A0724A", fontStyle: "italic", marginTop: "6px" }}>
                    ✓ {CATEGORY_DISPLAY[newItemCategory] || newItemCategory} items unhidden
                  </div>
                ) : hiddenCatalogItems.some(h => h.category === newItemCategory) ? (
                  <button
                    onClick={async () => {
                      await restoreHiddenByCategory(newItemCategory);
                      setAddModalResetDone(true);
                      setTimeout(() => setAddModalResetDone(false), 2000);
                    }}
                    style={{ background: "none", border: "none", borderBottom: "1px solid #C9A97A", color: "#A0724A", fontFamily: "'Lato', sans-serif", fontSize: "12px", padding: "0", marginTop: "6px", cursor: "pointer", display: "inline-block" }}
                  >
                    Unhide {hiddenCatalogItems.filter(h => h.category === newItemCategory).length} hidden {CATEGORY_DISPLAY[newItemCategory] || newItemCategory} {hiddenCatalogItems.filter(h => h.category === newItemCategory).length === 1 ? "item" : "items"}
                  </button>
                ) : null
              )}
            </div>
            {addError && <div className="modal-error">{addError}</div>}
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button
                className="modal-confirm"
                onClick={newItemName.trim() ? handleAddItem : undefined}
                style={{ opacity: newItemName.trim() ? 1 : 0.5, pointerEvents: newItemName.trim() ? "auto" : "none" }}
              >Add to List</button>
            </div>
          </div>
        </div>
      )}

      {/* Budget Goal Modal */}
      {showBudgetModal && (
        <div className="modal-overlay" onClick={() => setShowBudgetModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Set Budget Goal</h2>
            <p className="modal-subtitle">Get alerts when your cart is approaching or over your limit.</p>
            <div className="modal-field">
              <label className="modal-label">My Budget</label>
              <div className="modal-input-prefix">
                <span className="modal-prefix-symbol">$</span>
                <input
                  className="modal-input-inner"
                  type="number" placeholder="e.g. 150.00" min="0" step="1"
                  value={budgetInput} autoFocus
                  onChange={(e) => setBudgetInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveBudget(); if (e.key === "Escape") setShowBudgetModal(false); }}
                />
              </div>
            </div>
            <div className="modal-actions-spaced">
              {budgetNum !== null
                ? <button className="modal-remove" onClick={clearBudget}>Remove Goal</button>
                : <div />}
              <div style={{ display: "flex", gap: "10px" }}>
                <button className="modal-cancel" onClick={() => setShowBudgetModal(false)}>Cancel</button>
                <button className="modal-confirm" onClick={saveBudget}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {removeConfirmItem && (
        <div className="modal-overlay" onClick={() => setRemoveConfirmItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Remove from list?</h2>
            <p className="modal-subtitle">
              "{removeConfirmItem.name}" was added by {removeConfirmItem.addedByName}. Removing it takes it off the shared list for everyone.
            </p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setRemoveConfirmItem(null)}>Cancel</button>
              <button
                className="modal-remove"
                onClick={() => {
                  removeFromList(removeConfirmItem.name, removeConfirmItem.catalogItemId);
                  setRemoveConfirmItem(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editModalItem && (
        <div className="modal-overlay" onClick={() => setEditModalItem(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Edit Item</h2>

            {editModalItem.isCustom && (
              <div className="modal-field">
                <label className="modal-label">Item Name</label>
                <input
                  className="modal-input"
                  value={editModalName}
                  onChange={e => setEditModalName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") commitEditModal(); if (e.key === "Escape") setEditModalItem(null); }}
                  autoFocus
                />
              </div>
            )}

            {showPrices && (
              <div className="modal-field">
                <label className="modal-label">Price</label>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.82rem", color: "#8a7a60" }}>$</span>
                  <input
                    className="modal-input"
                    type="tel"
                    inputMode="numeric"
                    value={centsToDisplay(editModalPrice)}
                    onChange={e => setEditModalPrice(e.target.value.replace(/[^0-9]/g, ""))}
                    onKeyDown={e => { if (e.key === "Enter") commitEditModal(); if (e.key === "Escape") setEditModalItem(null); }}
                    autoFocus={!editModalItem.isCustom}
                  />
                </div>
              </div>
            )}

            {!editModalItem.isCustom && showPrices && (
              <p style={{
                fontFamily: "'Lato', sans-serif",
                fontSize: "0.75rem",
                color: "#8a7a60",
                margin: "12px 0 0 0",
                fontStyle: "italic"
              }}>
                This is a catalog item — only the price can be edited.
              </p>
            )}

            <div className="modal-actions-spaced">
              <div>
                {editModalItem.isCustom && (
                  <button
                    onClick={() => {
                      const ok = window.confirm(
                        `Delete "${editModalItem.name}" for the whole household? This removes it from the current list and can't be undone.`
                      );
                      if (ok) {
                        deleteItem(editModalItem.name);
                        setEditModalItem(null);
                      }
                    }}
                    style={{
                      fontFamily: "'Lato', sans-serif",
                      fontSize: "0.82rem",
                      color: "#b04a3f",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "8px 4px"
                    }}
                  >
                    Delete item
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button className="modal-cancel" onClick={() => setEditModalItem(null)}>Cancel</button>
                <button className="modal-confirm" onClick={commitEditModal}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manage Categories Modal */}
      {showManageCategoriesModal && (
        <div className="modal-overlay" onClick={() => setShowManageCategoriesModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: "80vh", overflowY: "auto" }}>
            <h2>Manage Categories</h2>

            {/* Create */}
            <div className="modal-field">
              <label className="modal-label">Create New Category</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  className="modal-input"
                  placeholder="e.g. Frozen Foods"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createCategory(newCategoryName)}
                  style={{ flex: 1 }}
                />
                <button
                  className="modal-confirm"
                  onClick={() => createCategory(newCategoryName)}
                  style={{ opacity: newCategoryName.trim() ? 1 : 0.5, pointerEvents: newCategoryName.trim() ? "auto" : "none" }}
                >Create</button>
              </div>
            </div>

            {/* Rename */}
            {isSignedIn && (
              <div className="modal-field">
                <label className="modal-label">Rename Category</label>
                <select className="modal-select" value={renamingCategory || ""}
                  onChange={e => { setRenamingCategory(e.target.value || null); setRenameValue(e.target.value); }}
                  style={{ marginBottom: "8px" }}>
                  <option value="">— select category —</option>
                  {categories.filter(cat => !CATEGORY_ORDER.includes(cat.rawName)).map(cat => (
                    <option key={cat.rawName} value={cat.rawName}>{cat.name}</option>
                  ))}
                </select>
                <p style={{ fontFamily: "'Lato', sans-serif", fontSize: "11px", color: "#A0724A", marginTop: "6px", fontStyle: "italic" }}>
                  Standard categories (Produce, Dairy, etc.) can't be renamed — only categories you've created.
                </p>
                {renamingCategory && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      className="modal-input"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && renameCategory(renamingCategory, renameValue)}
                      style={{ flex: 1 }}
                    />
                    <button
                      className="modal-confirm"
                      onClick={() => renameCategory(renamingCategory, renameValue)}
                      style={{ opacity: renameValue.trim() ? 1 : 0.5, pointerEvents: renameValue.trim() ? "auto" : "none" }}
                    >Rename</button>
                  </div>
                )}
              </div>
            )}

            {/* Delete */}
            {isSignedIn && (
              <div className="modal-field">
                <label className="modal-label">Delete Category</label>
                <select className="modal-select" value={deletingCategory?.rawName || ""}
                  onChange={e => {
                    const rawName = e.target.value;
                    if (!rawName) { setDeletingCategory(null); return; }
                    const itemCount = Object.values(catalogMap).filter(i => i.category === rawName).length;
                    setDeletingCategory({ rawName, itemCount });
                    setDeleteMoveTarget("");
                  }}
                  style={{ marginBottom: "8px" }}>
                  <option value="">— select category —</option>
                  {categories.filter(cat => !CATEGORY_ORDER.includes(cat.rawName)).map(cat => (
                    <option key={cat.rawName} value={cat.rawName}>{cat.name}</option>
                  ))}
                </select>
                <p style={{ fontFamily: "'Lato', sans-serif", fontSize: "11px", color: "#A0724A", marginTop: "6px", fontStyle: "italic" }}>
                  Standard categories (Produce, Dairy, etc.) can't be renamed — only categories you've created.
                </p>
                {deletingCategory && (
                  <>
                    {deletingCategory.itemCount > 0 && (
                      <>
                        <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "12px", color: "#8a7a60", marginBottom: "8px" }}>
                          {deletingCategory.itemCount} item{deletingCategory.itemCount !== 1 ? "s" : ""} in this category. Move them to:
                        </div>
                        <select className="modal-select" value={deleteMoveTarget}
                          onChange={e => setDeleteMoveTarget(e.target.value)}
                          style={{ marginBottom: "8px" }}>
                          <option value="">— delete all items too —</option>
                          {categories.filter(c => c.rawName !== deletingCategory.rawName).map(cat => (
                            <option key={cat.rawName} value={cat.rawName}>{cat.name}</option>
                          ))}
                        </select>
                      </>
                    )}
                    <button
                      className="modal-remove"
                      onClick={() => deleteCategory(deletingCategory.rawName, deleteMoveTarget || null)}
                    >
                      {deleteMoveTarget ? `Move & Delete Category` : `Delete${deletingCategory.itemCount > 0 ? " & Remove Items" : " Category"}`}
                    </button>
                  </>
                )}
              </div>
            )}

            {isSignedIn && (
              <div style={{ borderTop: "1px solid #e8ddd0", marginTop: "20px", paddingTop: "16px" }}>
                <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "#A0724A", marginBottom: "8px" }}>Danger Zone</div>
                {!showResetConfirm ? (
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    style={{ background: "none", border: "none", fontFamily: "'Lato', sans-serif", fontSize: "12px", color: "#c0392b", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                  >Restore default categories</button>
                ) : (
                  <div>
                    <p style={{ fontFamily: "'Lato', sans-serif", fontSize: "12px", color: "#2C1A0E", marginBottom: "10px" }}>
                      This will remove all custom categories and items you've created, and restore the original catalog. Items from the standard catalog on your current list will not be affected.
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => setShowResetConfirm(false)} className="modal-cancel" style={{ fontSize: "12px" }}>Cancel</button>
                      <button onClick={handleResetCategories} style={{ background: "#c0392b", color: "white", border: "none", borderRadius: "4px", padding: "6px 12px", fontFamily: "'Lato', sans-serif", fontSize: "12px", cursor: "pointer" }}>Yes, restore defaults</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button className="modal-confirm" onClick={() => { setShowManageCategoriesModal(false); setShowResetConfirm(false); }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Sheet */}
      {showProfileSheet && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(2,15,26,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}
          onClick={() => setShowProfileSheet(false)}
        >
          <div
            style={{ background: "#FDF8F2", borderRadius: "20px 20px 0 0", width: "100%", paddingBottom: "32px" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div style={{ width: "36px", height: "4px", background: "#c8b89a", borderRadius: "2px", margin: "10px auto 0" }} />

            {/* User row */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 20px 12px", borderBottom: "0.5px solid #e8ddd0" }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#0D9488", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: 600, color: "white", fontFamily: "'Lato', sans-serif", flexShrink: 0 }}>
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
              <div>
                {editingName ? (
              <input
                autoFocus
                defaultValue={profileName}
                onFocus={e => e.target.select()}
                onBlur={async (e) => {
                  const val = e.target.value.trim();
                  if (val && val !== profileName) {
                    const ok = await updateFullName(val, async (trimmed) => {
                      const parts = trimmed.split(" ");
                      const firstName = parts[0];
                      const lastName = parts.slice(1).join(" ") || undefined;
                      await user.update({ firstName, lastName });
                    });
                    if (ok) setProfileName(val);
                  }
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.target.blur();
                  if (e.key === "Escape") { setEditingName(false); }
                }}
                style={{
                  fontWeight: 600,
                  fontSize: "inherit",
                  fontFamily: "inherit",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid #C9A97A",
                  outline: "none",
                  width: "100%",
                  padding: "0 0 2px 0",
                  color: "inherit",
                }}
              />
            ) : (
              <div
                style={{ fontWeight: 600, cursor: "pointer" }}
                onClick={() => setEditingName(true)}
              >
                {profileName
                  || [user?.firstName, user?.lastName].filter(Boolean).join(" ")
                  || user?.primaryEmailAddress?.emailAddress}
              </div>
            )}
                <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "12px", color: "#A0724A", marginTop: "2px" }}>{user?.primaryEmailAddress?.emailAddress}</div>
              </div>
            </div>

            {/* Preferences */}
            <div style={{ padding: "14px 20px 8px" }}>
              <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "#A0724A", marginBottom: "12px" }}>Preferences</div>

              {/* Show prices toggle */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "12px", borderBottom: "0.5px solid #e8ddd0" }}>
                <div>
                  <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "14px", color: "#2C1A0E" }}>Show prices &amp; budget</div>
                  <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "11px", color: "#A0724A", marginTop: "2px" }}>Display item prices and estimated total</div>
                </div>
                <div
                  onClick={() => setShowPrices(p => !p)}
                  style={{ width: "44px", height: "26px", borderRadius: "13px", background: showPrices ? "#c8973a" : "#d4c9b8", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" }}
                >
                  <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "white", position: "absolute", top: "3px", left: showPrices ? "21px" : "3px", transition: "left 0.15s" }} />
                </div>
              </div>

              {/* List text size stepper */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px" }}>
                <div>
                  <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "14px", color: "#2C1A0E" }}>List text size</div>
                  <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "11px", color: "#A0724A", marginTop: "2px" }}>Bigger text for the list, on this device</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", border: "1px solid #E8D5B7", borderRadius: "7px", background: "#fff", padding: "5px 10px", flexShrink: 0 }}>
                  <button
                    onClick={() => setTextSizeIdx(i => Math.max(0, i - 1))}
                    disabled={textSizeIdx === 0}
                    style={{ background: "none", border: "none", cursor: textSizeIdx === 0 ? "default" : "pointer", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "0.78rem", color: textSizeIdx === 0 ? "#d8c8aa" : "#A0724A", lineHeight: 1, padding: 0 }}
                  >A</button>
                  <span style={{ fontFamily: "'Lato', sans-serif", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#A0724A", minWidth: "56px", textAlign: "center" }}>{TEXT_LABELS[textSizeIdx]}</span>
                  <button
                    onClick={() => setTextSizeIdx(i => Math.min(TEXT_STEPS.length - 1, i + 1))}
                    disabled={textSizeIdx === TEXT_STEPS.length - 1}
                    style={{ background: "none", border: "none", cursor: textSizeIdx === TEXT_STEPS.length - 1 ? "default" : "pointer", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "1.05rem", color: textSizeIdx === TEXT_STEPS.length - 1 ? "#d8c8aa" : "#A0724A", lineHeight: 1, padding: 0 }}
                  >A</button>
                </div>
              </div>
            </div>

            {/* Sign out */}
            <div style={{ height: "0.5px", background: "#e8ddd0", margin: "0 20px" }} />
            <button
              onClick={() => signOut(() => setShowProfileSheet(false))}
              style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 20px", background: "none", border: "none", cursor: "pointer", width: "100%" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span style={{ fontFamily: "'Lato', sans-serif", fontSize: "14px", color: "#c0392b" }}>Sign out</span>
            </button>
          </div>
        </div>
      )}

      {showWrapUpModal && (
        <div className="modal-overlay" onClick={() => !wrappingUp && setShowWrapUpModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "360px" }}>

            {/* Header */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: "1.1rem", color: "#3D2B1F", marginBottom: "4px" }}>
                Wrap up this trip
              </div>
              <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.75rem", color: "#8B6B4A", letterSpacing: "0.5px" }}>
                {boughtItems.length} item{boughtItems.length !== 1 ? "s" : ""} bought
                {pendingItems.length > 0 && ` · ${pendingItems.length} still pending`}
              </div>
            </div>

            {/* Pending items — roll-forward selection */}
            {pendingItems.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.65rem", letterSpacing: "1px", textTransform: "uppercase", color: "#8B6B4A", marginBottom: "8px" }}>
                  Roll onto next list?
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "200px", overflowY: "auto" }}>
                  {pendingItems.map(item => {
                    const selected = wrapUpRollItems.has(item.name);
                    return (
                      <div
                        key={item.name}
                        onClick={() => {
                          setWrapUpRollItems(prev => {
                            const next = new Set(prev);
                            if (next.has(item.name)) next.delete(item.name);
                            else next.add(item.name);
                            return next;
                          });
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: "8px",
                          padding: "6px 8px", borderRadius: "4px", cursor: "pointer",
                          background: selected ? "rgba(13,148,136,0.08)" : "transparent",
                          border: `1px solid ${selected ? "#0D9488" : "rgba(160,114,74,0.2)"}`,
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{
                          width: "16px", height: "16px", borderRadius: "3px", flexShrink: 0,
                          border: `1.5px solid ${selected ? "#0D9488" : "#C9A97A"}`,
                          background: selected ? "#0D9488" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {selected && <span style={{ color: "white", fontSize: "10px", lineHeight: 1 }}>✓</span>}
                        </div>
                        <span style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.85rem", color: "#3D2B1F" }}>
                          {item.name}
                        </span>
                        {item.qty > 1 && (
                          <span style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.7rem", color: "#8B6B4A", marginLeft: "auto" }}>
                            ×{item.qty}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Select all / none shortcuts */}
                <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                  <button
                    onClick={() => setWrapUpRollItems(new Set(pendingItems.map(i => i.name)))}
                    style={{ background: "none", border: "none", fontFamily: "'Lato', sans-serif", fontSize: "0.7rem", color: "#A0724A", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => setWrapUpRollItems(new Set())}
                    style={{ background: "none", border: "none", fontFamily: "'Lato', sans-serif", fontSize: "0.7rem", color: "#A0724A", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                  >
                    Clear all
                  </button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                className="modal-cancel"
                onClick={() => setShowWrapUpModal(false)}
                disabled={wrappingUp}
              >
                Cancel
              </button>
              <button
                className="modal-confirm"
                onClick={handleWrapUp}
                disabled={wrappingUp}
                style={{ minWidth: "100px" }}
              >
                {wrappingUp
                  ? "Saving..."
                  : wrapUpRollItems.size > 0
                    ? `Roll ${wrapUpRollItems.size} forward`
                    : "Close & clear"
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShoppingListApp() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [systemMessage, setSystemMessage] = useState(null);
  const systemMsgTimerRef = useRef(null);

  const postSystemMessage = useCallback((msg) => {
    setSystemMessage(msg);
    if (systemMsgTimerRef.current) clearTimeout(systemMsgTimerRef.current);
    systemMsgTimerRef.current = setTimeout(() => setSystemMessage(null), msg.durationMs);
  }, []);

  const dismissSystemMessage = useCallback(() => {
    setSystemMessage(null);
    if (systemMsgTimerRef.current) clearTimeout(systemMsgTimerRef.current);
  }, []);

  const onRemoval = useCallback((householdName, provisioned) => {
    postSystemMessage({
      kind: 'info',
      householdName,
      subtext: provisioned ? "We've set you up with a fresh household." : undefined,
      durationMs: 30000,
      dismissible: true,
    });
  }, [postSystemMessage]);

  return (
    <ConnectivityProvider>
      <ActiveHouseholdProvider getToken={getToken} clerkId={user?.id} onRemoval={onRemoval}>
        <HouseholdDebugLog />
        <ProvisionsApp />
      </ActiveHouseholdProvider>
      {systemMessage && (
        <>
          <style>{`@keyframes shrinkBar { from { width: 100% } to { width: 0% } }`}</style>
          <div style={{
            position: 'fixed', left: '14px', right: '14px', bottom: '18px',
            borderRadius: '10px', padding: '13px 15px',
            display: 'flex', gap: '12px', alignItems: 'flex-start',
            background: 'rgba(44, 26, 14, 0.5)',
            border: '1px solid rgba(13, 148, 136, 0.4)',
            borderLeft: '4px solid #0D9488',
            color: '#FAF4EC',
            boxShadow: '0 8px 26px rgba(44,26,14,0.18)',
            backdropFilter: 'blur(7px)',
            overflow: 'hidden',
            zIndex: 1500,
            fontFamily: "'Lato', sans-serif",
          }}>
            <div style={{
              position: 'absolute', left: 0, bottom: 0, height: '2px',
              background: '#0D9488', opacity: 0.9, borderBottomLeftRadius: '10px',
              animation: `shrinkBar ${systemMessage.durationMs}ms linear forwards`,
            }} />
            <span style={{ fontSize: '18px', color: '#5fd8c9', flexShrink: 0, lineHeight: '1.3' }}>ⓘ</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13.5px', fontWeight: 400, lineHeight: '1.4', color: '#FAF4EC' }}>
                No longer a member of{' '}
                <strong style={{ color: '#5fd8c9', fontWeight: 700 }}>
                  {systemMessage.householdName ?? 'that household'}
                </strong>.
              </div>
              {systemMessage.subtext && (
                <div style={{ fontSize: '12px', marginTop: '4px', lineHeight: '1.4', color: 'rgba(250,244,236,0.8)' }}>
                  {systemMessage.subtext}
                </div>
              )}
            </div>
            {systemMessage.dismissible && (
              <button
                onClick={dismissSystemMessage}
                style={{
                  background: 'none', border: 'none', color: '#FAF4EC',
                  opacity: 0.6, fontSize: '16px', flexShrink: 0,
                  cursor: 'pointer', padding: 0, lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </>
      )}
    </ConnectivityProvider>
  );
}
