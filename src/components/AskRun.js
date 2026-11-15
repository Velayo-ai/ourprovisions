import { useEffect, useId, useRef, useState } from "react";
import { pickLine } from "../lib/askCreate";
import { tapTile, takeOut, canConfirm, shelfTitlePrefix, effectiveTarget, tileFace, heldAskWrite, storeHeldAsk } from "../lib/askRun";
import { useHold, holdFillCss } from "../hooks/useHold";

// Running an Ask (SPEC_ask amendment A13–A17, A24; SPEC_ask_slice2 C3b; the wagon polish + the
// hand-back, SPEC_ask_wagon_handback W1–W10). Invitation → Participation → Contribution, three
// screens full screen over the app: (1) "Your turn, {Label}!" — the hand-over, the wagon on the sand
// at sunrise, Let's pick; (2) the shelf — "Pick {n}, {Label}!", the tiles, the small wagon + dots,
// That's it!; (3) "Great picks, {Label}!" — the wagon holding his picks, "Your picks are on our list!",
// what landed, "Give it back to {Parent}" (W7, W8; singular when exactly one landed). The look is
// docs/mockups/mockup_ask_wagon_polish.html (its final round).
//
// Picks stay on the phone (in the wagon) until That's it!, then land in ONE write (onLand →
// land_ask_picks, A16 / A22). Done needs a press-and-hold of about a second (A17); before the
// confirm it discards everything. There is no way back from the shelf screen (A17).
//
// PRIVACY (A24, K3): the whole run is .op-replay-block (replay keeps its size only), and every
// copy of the name sits in .op-name, so it also leaves click-text spans. No state reaches the URL
// or document.title.
//
// SIMPLE (SPEC_ask_slice3 S3-1–S3-4): ONE component for both styles, so they can't drift into two
// experiences. Simple switches only three things: the tiles (2×2, big, never scrolling), the tile
// names (off; a plain tile keeps its name, else it would be blank; aria-label carries it), and the
// child's two buttons (Let's pick → ▶, That's it! → ✓; the words stay as aria-label). The
// grown-up's controls (Close, Done, Give it back), the titles and Great picks stay words on both.
//
// A SHORT SHELF RUNS (SPEC_ask_slice4 S4-5): the target is the EFFECTIVE one, least(pick_target,
// live tiles) — "Pick 2, Everett!" on a 2-tile shelf with target 3 — on Your turn, the title, the
// dots and That's it! alike; land_ask_picks (083) accepts exactly that count. The child never
// meets a grown-up screen: a missing tile is the grown-up's business, said in Browse and Manage.
// The caller never opens a run with 0 live tiles.
//
// RESUME (A26 as amended by S3-6): while the hand-over or the shelf is up, every change of screen
// or picks rewrites op_ask_held ({ask_id, screen, ids}); Great picks clears it, because the picks
// have landed. A failed land keeps it with the wagon. The caller clears it on every other way out
// and hands a reloaded run its held screen and picks through `resume`.

// THE WAGON (W1–W4; A15 as polished): ONE drawing at three sizes — the turn (large), the shelf (small,
// ~150px) and Great picks (large) — so it is the visual thread through all three screens. A beach
// wagon seen from three-quarters (the back rim shows): a deep cream tub with a rolled lip, a teal
// stripe on the body, four wooden wheels (the far pair dimmed; quiet grain, faint spokes, no inner
// ring), a soft ground shadow. Drawn in three layers so the picks sit IN it: the back (shadow, far
// wheels, the inside of the tub), then the pick cards, then the front (tub, stripe, lip, the fixed
// undercarriage bracket and tongue, the near wheels, the handle).
// THE HANDLE (W3) is a separate part in front of the tub: it pivots on a round wooden joint (hub
// size) at the front lower-left corner; a short tongue links the pivot to a bracket fixed on the front
// undercarriage, drawn BEHIND the front wheel (the wheel hides most of it). The shaft angles up-left
// to a short dark grip. It never touches the tub wall or rim, and the tongue never touches a hub.
// Only the wheels rotate (motion); the bracket and tongue stay still; the handle only swings on its
// pivot on the turn screen.
// PICKS ARE CARDS (W4): the tile's photo, else its glyph, else its name, on a cream card with a ~3px
// border, slightly taller than wide, riding above the rim with a gentle tilt spread evenly for 1–4
// picks, their bottoms behind the front panel. Tappable to take out while the shelf is open.
// 5–6 PICKS (2026-11-14): one row across the rim would leave ~37 units a card, too narrow for a
// two-word name. So they pile in two tiers, like a full wagon: left to right in pick order, zig-zagging
// front, back, front…; the back tier stands higher (its names in the part that shows above the front
// tier) and is drawn first, so the front tier sits in front of it. Left-to-right is still pick order.
const WAGON_W = 260, WAGON_H = 150;
const RIM_CX = 144;                       // the tub's centre line
// Card geometry for n picks, in wagon units: size, the spacing between centres, and the tilts.
export const BACK_RISE = 34;               // how much higher the back tier stands (5–6 picks)
export function cardLayout(n) {
  if (n <= 0) return [];
  if (n >= 5) {
    const m = Math.min(n, 6);
    const w = m === 5 ? 50 : 46, h = m === 5 ? 56 : 52, d = m === 5 ? 34 : 29;
    const tilts = m === 5 ? [-6, -4, 0, 4, 6] : [-7, -5, -2, 2, 5, 7];
    return Array.from({ length: m }, (_, k) => {
      const back = k % 2 === 1;
      const tilt = tilts[k];
      const cx = RIM_CX + (k - (m - 1) / 2) * d;
      const y = 10 + Math.abs(tilt) * 0.4 - (back ? BACK_RISE : 0);
      // a back card's face is centred in the part that shows above the front tier
      return { x: cx - w / 2, y, w, h, tilt, back, faceCy: back ? y + (BACK_RISE + 8) / 2 : y + h * 0.46 };
    });
  }
  const w = n >= 4 ? 40 : 46, h = n >= 4 ? 44 : 50, gap = n >= 4 ? 41 : 44;
  const tilts = { 1: [0], 2: [-5, 5], 3: [-8, 0, 8], 4: [-9, -3, 3, 9] }[n];
  return Array.from({ length: n }, (_, k) => {
    const tilt = tilts[k] ?? 0;
    const cx = RIM_CX + (k - (n - 1) / 2) * gap;
    const y = 13 + Math.abs(tilt) * 0.45;
    return { x: cx - w / 2, y, w, h, tilt, back: false, faceCy: y + h * 0.5 };
  });
}

function Wheel({ x, y, far, wood }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={far ? 0.75 : undefined}>
      <g className="ask-wheel-spin">
        <circle r="17" fill={`url(#${wood})`} stroke="#6E4A2A" strokeWidth="3" />
        <path d="M0 -15 V15 M-15 0 H15 M-10.6 -10.6 L10.6 10.6 M-10.6 10.6 L10.6 -10.6" stroke="#7F5532" strokeWidth="1.1" opacity=".3" />
        <circle r="4.5" fill="#3B2A1C" />
      </g>
    </g>
  );
}

// One pick on a card (W4). Position and tilt sit on the outer group (an attribute); the drop-in
// motion runs on the inner one, so a CSS transform never overrides the placement.
function PickCard({ tile, box, uid, fresh, onTakeOut }) {
  const { x, y, w, h, tilt } = box;
  const face = tileFace(tile);
  const clip = `${uid}-c-${String(tile.id).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6;
  const words = String(tile.name).split(/\s+/);
  const lines = words.length > 1 && tile.name.length > 9 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [tile.name];
  return (
    <g transform={`rotate(${tilt} ${x + w / 2} ${y + h})`}
      className="ask-wagon-pick" role={onTakeOut ? "button" : undefined} tabIndex={onTakeOut ? 0 : undefined}
      aria-label={onTakeOut ? `Take out ${tile.name}` : tile.name}
      onClick={onTakeOut ? () => onTakeOut(tile.id) : undefined}
      onKeyDown={onTakeOut ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTakeOut(tile.id); } } : undefined}>
      <g className={`ask-card${fresh ? " fresh" : ""}`}>
        <defs><clipPath id={clip}><rect x={ix} y={iy} width={iw} height={ih} rx="4.5" /></clipPath></defs>
        <rect x={x} y={y} width={w} height={h} rx="7" fill="#FFFDF9" stroke="#EADBC2" strokeWidth="1" />
        <rect x={ix} y={iy} width={iw} height={ih} rx="4.5" fill="#F6EDDF" />
        {face === "photo" ? (
          <image className="op-replay-block" href={tile.photoUrl} x={ix} y={iy} width={iw} height={ih} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        ) : face === "glyph" ? (
          <text x={x + w / 2} y={box.faceCy + w * 0.2} textAnchor="middle" fontSize={w * 0.56}>{tile.glyph}</text>
        ) : (
          <text x={x + w / 2} y={box.faceCy - (lines.length - 1) * 5 + 3} textAnchor="middle" fontSize="9" fontFamily="Lato, sans-serif" fontWeight="700"
            fill="#2C1A0E" clipPath={`url(#${clip})`}>
            {lines.map((ln, k) => <tspan key={k} x={x + w / 2} dy={k === 0 ? 0 : 10}>{ln}</tspan>)}
          </text>
        )}
      </g>
    </g>
  );
}

function Wagon({ picks, onTakeOut, fresh, kick, className = "", label = null }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const n = picks.length;
  const boxes = cardLayout(n);
  // Paint order: the back tier (5–6 picks) first, then the front; pick order is the x order either way.
  const painted = picks.map((t, k) => ({ t, box: boxes[k] })).sort((a, b) => (a.box.back === b.box.back ? 0 : a.box.back ? -1 : 1));
  // Gradient ids are per instance (two wagons can be on screen during a transition).
  const ids = { BODY: `${uid}-body`, WOOD: `${uid}-wood` };
  return (
    <svg className={`ask-wagon ${className}${kick ? ` ${kick.kind}` : ""}`} key={kick ? kick.n : 0}
      viewBox={`0 0 ${WAGON_W} ${WAGON_H}`} role={onTakeOut ? "group" : "img"} aria-label={label || (n === 0 ? "The wagon, empty" : `The wagon, ${n} in it`)}>
      <defs>
        <linearGradient id={ids.BODY} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFDF8" /><stop offset="1" stopColor="#EFE4D1" /></linearGradient>
        <linearGradient id={ids.WOOD} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C99660" /><stop offset="1" stopColor="#9A6A3E" /></linearGradient>
      </defs>
        {/* back: ground shadow, the far wheels, the inside of the tub (back rim + inner wall) */}
        <g pointerEvents="none">
          <ellipse cx="134" cy="142" rx="104" ry="7" fill="#6E4A2A" opacity=".16" />
          <Wheel x={96} y={122} far wood={ids.WOOD} />
          <Wheel x={196} y={122} far wood={ids.WOOD} />
          <path d="M58 50 Q58 42 66 42 H222 Q230 42 230 50 L226 58 H62 Z" fill="#E6D8C1" />
        </g>
        {/* the picks, on cards */}
        {painted.map(({ t, box }) => (
          <PickCard key={t.id} tile={t} box={box} uid={uid} fresh={t.id === fresh} onTakeOut={onTakeOut} />
        ))}
        {/* front: tub, stripe, rolled lip, the fixed bracket + tongue (behind the front wheel), the near wheels, the handle */}
        <g pointerEvents="none">
          <path d="M56 56 H232 L222 110 Q220 116 213 116 H75 Q68 116 66 110 Z" fill={`url(#${ids.BODY})`} stroke="#D2BC98" strokeWidth="1.5" />
          <path d="M60 82 H228 L226 92 H62 Z" fill="#0D9488" />
          <rect x="50" y="50" width="188" height="10" rx="5" fill="#FFFDF9" stroke="#D2BC98" strokeWidth="1.5" />
          <rect className="ask-wagon-bracket" x="70" y="109" width="26" height="7" rx="2.5" fill="#8A5E37" />
          <path className="ask-wagon-tongue" d="M74 113 L60 119" stroke="#8A5E37" strokeWidth="4.5" strokeLinecap="round" />
          <Wheel x={86} y={126} wood={ids.WOOD} />
          <Wheel x={204} y={126} wood={ids.WOOD} />
          <g className="ask-wagon-handle">
            <path d="M60 119 L35 52 Q33 46 28 43" fill="none" stroke={`url(#${ids.WOOD})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M29 43.5 L14 37" stroke="#3B2A1C" strokeWidth="8" strokeLinecap="round" />
            <circle cx="60" cy="119" r="5" fill="#B5814B" stroke="#7F5532" strokeWidth="1.5" />
            <circle cx="60" cy="119" r="1.8" fill="#3B2A1C" />
          </g>
        </g>
    </svg>
  );
}

// A tile's face in HTML: the photo, the item's glyph, or nothing (the name carries a plain tile).
function TileFace({ tile, glyphClass }) {
  const face = tileFace(tile);
  if (face === "photo") return <img className="op-replay-block op-photo" src={tile.photoUrl} alt="" draggable="false" />;
  if (face === "glyph") return <span className={glyphClass}>{tile.glyph}</span>;
  return null;
}

// The top-right control (A17; W6): press and hold about a second; a short tap only says "Hold to …".
// Quiet text — no pill, no border, ink at ~62%. "Close" on the turn screen (before he starts, nothing
// is "done"), "Done" on the shelf; Great picks has none. The hold itself is hooks/useHold — shared
// with the landscape Staples tiles.
function HoldDone({ onDone, label = "Done", hold = "Hold to finish" }) {
  const [hint, setHint] = useState(false);
  const hintTimer = useRef(null);
  useEffect(() => () => { clearTimeout(hintTimer.current); }, []);
  const { holding, bind } = useHold({
    onHold: onDone,
    onRelease: () => {
      setHint(true);
      clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(false), 1600);
    },
  });
  return (
    <button type="button" className={`ask-done${holding ? " holding" : ""}`} aria-label={hold}
      {...bind}>
      <span className="ask-done-fill" aria-hidden="true" />
      <span className="ask-done-text">{hint ? hold : label}</span>
    </button>
  );
}

// The shelf screen's title and the other two screens' names: the name always in .op-name.
const Name = ({ children }) => <span className="op-name">{children}</span>;

// ask: { id, label, shelfNoun, pickTarget, screenStyle }. tiles: the LIVE tiles [{ id, name, glyph,
// photoUrl }] in shelf order; glyph is the ITEM's own (null when the catalog has none), never the aisle's.
// onLand(ids) resolves when the picks are on the list and throws when they are not.
// resume: { screen, ids } from op_ask_held after a reload (heldAskRead has checked it), else null.
// parentName (W8): the signed-in member's first name — the phone's owner — for "Give it back to
// {Parent}"; null reads "Give it back". onHandBack({ count, ids }) (W8, W9): Great picks' one exit —
// the caller closes the run, lands on Browse and shows "{Label} added {N} · See" once. Without it the
// button just exits.
export function AskRun({ ask, tiles, onLand, onExit, resume = null, parentName = null, onHandBack = null }) {
  const target = effectiveTarget(ask, tiles);
  const simple = ask.screenStyle === "simple";
  const [screen, setScreen] = useState(() => resume?.screen || "turn");     // turn | shelf | done
  const [picks, setPicks] = useState(() => resume?.ids || []);
  const [fresh, setFresh] = useState(null);
  const [kick, setKick] = useState(null);           // { kind: "hop" | "shake", n } — restarts the motion
  const [landing, setLanding] = useState(false);
  const [failed, setFailed] = useState(false);
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const inWagon = picks.map((id) => byId.get(id)).filter(Boolean);
  // Great picks shows the picks in the order they were made — the shelf wagon's order — fixed at the
  // moment they land: the tiles as they were then, so a list refresh after the land (new tiles, a tile
  // gone) can't reorder, drop or change a card. Never list order or land order.
  const [landedTiles, setLandedTiles] = useState(null);
  const shown = screen === "done" && landedTiles ? landedTiles : inWagon;
  const one = picks.length === 1;   // Great picks reads singular when exactly one landed

  useEffect(() => {
    storeHeldAsk(screen === "done" ? null : heldAskWrite(ask.id, screen, picks));
  }, [ask.id, screen, picks]);

  const bump = (kind) => setKick((k) => ({ kind, n: (k ? k.n : 0) + 1 }));
  const tap = (id) => {
    if (landing) return;
    const r = tapTile(picks, id, target);
    if (r.effect === "full") { bump("shake"); return; }
    setPicks(r.picks);
    setFailed(false);
    if (r.effect === "added") { setFresh(id); bump("hop"); }
  };
  const out = (id) => { if (!landing) { setPicks((p) => takeOut(p, id)); setFailed(false); } };
  const confirm = async () => {
    if (!canConfirm(picks, target) || landing) return;
    setLanding(true);
    setFailed(false);
    try {
      const snapshot = inWagon;
      await onLand(picks);
      setLandedTiles(snapshot);
      setScreen("done");
    } catch (_e) {
      setFailed(true);   // the wagon stays held; That's it! can be tapped again
    } finally {
      setLanding(false);
    }
  };

  // W6: "Close" on the turn screen, "Done" on the shelf, nothing on Great picks (the picks have landed;
  // the bottom button is the one exit).
  const top = (
    <div className="ask-top">
      <span className="ask-eyebrow">Ask <Name>{ask.label}</Name></span>
      {screen === "turn" && <HoldDone onDone={onExit} label="Close" hold="Hold to close" />}
      {screen === "shelf" && <HoldDone onDone={onExit} label="Done" hold="Hold to finish" />}
    </div>
  );
  // W8: the child hands the phone back. Once: the run closes on the first tap.
  const [handedBack, setHandedBack] = useState(false);
  const giveBack = () => {
    if (handedBack) return;
    setHandedBack(true);
    if (onHandBack) onHandBack({ count: shown.length, ids: shown.map((t) => t.id) });
    else onExit();
  };

  return (
    <div className="ask-run op-replay-block" role="dialog" aria-modal="true" aria-label="Ask">
      <style>{ASK_RUN_CSS}</style>
      {screen === "turn" && (
        <div className="ask-screen ask-turn">
          {/* W5: the scene runs the full height — sky → water → sand. The horizon sits high, just under the
              top bar, so the title, its rule and the pick line sit on calm water. One faint glow on the
              sun and its faint blurred path on the water, no glints; the far hills quiet (0.3). The wagon
              rests on the sand. No towel. */}
          <svg className="ask-scene" viewBox="0 0 300 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
              <linearGradient id="ask-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E4ECEF" /><stop offset=".6" stopColor="#F6DFC0" /><stop offset="1" stopColor="#F9E9D2" /></linearGradient>
              <linearGradient id="ask-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#B9CCD0" /><stop offset=".7" stopColor="#E9E3D6" /><stop offset="1" stopColor="#F3E7D4" /></linearGradient>
              <linearGradient id="ask-sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#EEDFC6" /><stop offset="1" stopColor="#F6ECDC" /></linearGradient>
              <radialGradient id="ask-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#FFF3D6" stopOpacity=".95" /><stop offset="1" stopColor="#FFF3D6" stopOpacity="0" /></radialGradient>
              <linearGradient id="ask-veil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FAF4EC" stopOpacity="0" /><stop offset="1" stopColor="#FAF4EC" stopOpacity=".85" /></linearGradient>
              <linearGradient id="ask-path" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFF1CF" stopOpacity=".9" /><stop offset="1" stopColor="#FFF1CF" stopOpacity="0" /></linearGradient>
              <filter id="ask-blur" x="-50%" y="-20%" width="200%" height="140%"><feGaussianBlur stdDeviation="5" /></filter>
            </defs>
            <rect width="300" height="620" fill="url(#ask-sky)" />
            <g className="ask-sun">
              <circle cx="82" cy="104" r="56" fill="url(#ask-glow)" />
              <circle cx="82" cy="104" r="15" fill="#FBE2AE" />
            </g>
            <path d="M118 112 Q180 92 300 98 V114 H118 Z" fill="#8E9DAA" opacity=".3" />
            <rect y="112" width="300" height="250" fill="url(#ask-water)" />
            {/* The sun's path on the water (the mock's final round): one soft, blurred, tapering glow at 0.25 — no glints. */}
            <path className="ask-sun-path" d="M74 113 H90 L128 330 H36 Z" fill="url(#ask-path)" filter="url(#ask-blur)" opacity=".25" />
            <path d="M0 350 Q80 340 150 346 T300 344 V620 H0 Z" fill="url(#ask-sand)" />
            <path d="M0 350 Q80 340 150 346 T300 344" fill="none" stroke="#FFFFFF" strokeWidth="1.5" opacity=".5" />
            <rect width="300" height="620" fill="url(#ask-veil)" opacity=".35" />
          </svg>
          {top}
          <div className="ask-turn-body">
            <h1 className="ask-h1">Your turn,{" "}<br /><Name>{ask.label}</Name>!</h1>
            <div className="ask-rule" aria-hidden="true" />
            <p className="ask-line">{pickLine(target, ask.shelfNoun)}</p>
          </div>
          {/* Motion: after the sun, the wagon rolls in from the left (wheels turning), rocks once on the
              stop, and the handle swings ~4° on its pivot and settles. */}
          <div className="ask-turn-wagon"><div className="ask-roll ask-roll-turn"><Wagon picks={[]} className="ask-wagon-arrive" /></div></div>
          <div className="ask-foot">
            {simple ? (
              <button type="button" className="ask-primary ask-icon ask-go" aria-label="Let's pick" onClick={() => setScreen("shelf")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6L18.8 12z" fill="currentColor" /></svg>
              </button>
            ) : (
              <button type="button" className="ask-primary" onClick={() => setScreen("shelf")}>Let's pick</button>
            )}
          </div>
        </div>
      )}

      {screen === "shelf" && (
        <div className="ask-screen ask-shelf">
          {top}
          <h1 className="ask-h1 ask-h1-left">{shelfTitlePrefix(target)}<Name>{ask.label}</Name>!</h1>
          <div className="ask-rule ask-rule-left" aria-hidden="true" />
          <div className={`ask-tiles${simple ? " ask-tiles-simple" : ""}`} role="group" aria-label="The ask">
            {tiles.map((t) => {
              // The pick ORDER (2026-11-14): a picked card's number is its place in `picks` — the wagon's
              // order and Great picks' order — so an unpick renumbers the rest at once (1,2,3,4 − 2 → 1,2,3).
              const order = picks.indexOf(t.id) + 1;
              const on = order > 0;
              const plain = tileFace(t) === "name";
              const label = on ? `${t.name}, pick ${order} of ${target}` : (simple && !plain ? t.name : undefined);
              return (
                <button key={t.id} type="button" className={`ask-tile${on ? " picked" : ""}${plain ? " plain" : ""}`} aria-pressed={on}
                  aria-label={label} onClick={() => tap(t.id)}>
                  {/* A plain name tile: the name fills the face, once — no art box, no second label.
                      On Simple the picture alone carries any other tile (S3-2). */}
                  {plain ? (
                    <span className="ask-tile-name ask-tile-name-only">{t.name}</span>
                  ) : (
                    <>
                      <span className="ask-tile-art" aria-hidden="true"><TileFace tile={t} glyphClass="ask-tile-glyph" /></span>
                      {!simple && <span className="ask-tile-name">{t.name}</span>}
                    </>
                  )}
                  {/* Shopper: the badge says the pick's number — a white ✓ first, then (~350ms) the ✓
                      crossfades with a slight scale into the number (~200ms), calm, no bounce. Explorer
                      keeps its plain ✓. Reduced motion: the number at once (the resting state). */}
                  {simple ? (
                    <span className="ask-tile-check" aria-hidden="true">✓</span>
                  ) : (
                    <span className="ask-tile-check ask-tile-order" aria-hidden="true">
                      <span className="ask-order-check">✓</span>
                      <span className="ask-order-num">{on ? order : ""}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className={`ask-cartbar${inWagon.length >= 5 ? " ask-cartbar-tall" : ""}`}>
            {/* The footer wagon (2026-11-14): ~185px, centred above where That's it! appears. Shopper has no
                dots — the numbers on the cards carry the count; the count stays for screen readers. */}
            <div className="ask-cartrow">
              <Wagon picks={inWagon} onTakeOut={out} fresh={fresh} kick={kick} className="ask-wagon-small" />
              {simple ? (
                <div className="ask-dots" aria-label={`${picks.length} of ${target} picked`}>
                  {Array.from({ length: target }, (_, k) => <span key={k} className={`ask-dot${k < picks.length ? " on" : ""}`} />)}
                </div>
              ) : (
                <span className="ask-sr" aria-live="polite" aria-label={`${picks.length} of ${target} picked`}>{picks.length} of {target} picked</span>
              )}
            </div>
            {failed && <div className="ask-failed" role="alert">That didn't reach the list. {simple ? "Tap ✓ again." : "Try That's it! again."}</div>}
            <div className="ask-actions">
              {simple ? (
                <button type="button" className={`ask-primary ask-icon ask-thats-it${canConfirm(picks, target) ? " show" : ""}`}
                  aria-label={landing ? "Adding…" : "That's it!"} onClick={confirm} disabled={!canConfirm(picks, target) || landing}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.6 4.6L19 7.6" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ) : (
                <button type="button" className={`ask-primary ask-thats-it${canConfirm(picks, target) ? " show" : ""}`}
                  onClick={confirm} disabled={!canConfirm(picks, target) || landing}>{landing ? "Adding…" : "That's it!"}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {screen === "done" && (
        <div className="ask-screen ask-finale">
          {top}
          <h1 className="ask-h1">{one ? "Great pick," : "Great picks,"}{" "}<br /><Name>{ask.label}</Name>!</h1>
          <div className="ask-rule" aria-hidden="true" />
          {/* The wagon is the summary (2026-11-14): no list under it. As large as fits at 375×667 with the
              line and the button; a raised back tier (5–6 picks) gets its room above. Screen readers get
              the list from the wagon's label, in pick order. */}
          <div className={`ask-rollin ask-roll${shown.length >= 5 ? " ask-rollin-tall" : ""}`}>
            <Wagon picks={shown} label={`${one ? "Your pick" : "Your picks"}: ${shown.map((t) => t.name).join(", ")}`} />
          </div>
          {/* W7 (amends A14): the credit is his, and the list is "our" list. */}
          <p className="ask-line">{one ? "Your pick is on our list!" : "Your picks are on our list!"}</p>
          <div className="ask-foot">
            {/* W8: the hand-back. The parent's first name sits in .op-name like any name in the run. */}
            <button type="button" className="ask-primary ask-give-back" onClick={giveBack} disabled={handedBack}>
              {parentName ? <>Give it back to <Name>{parentName}</Name></> : "Give it back"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Tokens: the app's cream / espresso / sand, brand teal on fills (the 10-07 ruling: teal text uses
// #0A776D; brand #0D9488 on fills and large type only). W10: Playfair for the three titles, Lato for
// everything else, the buttons included. Motion (the spec's motion section): sunrise, then the
// wagon's roll-in with turning wheels, one rock on the stop and a ~4° handle swing on its pivot; on
// the shelf, drop-in + hop with a quarter turn of the wheels; on Great picks, roll-in with turning
// wheels. Only the wheels rotate. All of it off under reduced motion, where every element rests at
// its final state.
const ASK_RUN_CSS = `
.ask-run { position: fixed; inset: 0; z-index: 2000; background: #FAF4EC; color: #2C1A0E; overflow: hidden;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
.ask-screen { position: relative; height: 100%; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; }
.ask-top { position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: center; padding: 18px 20px 0; }
.ask-eyebrow { font: 700 calc(12.5px * var(--op-text-scale, 1)) 'Lato', sans-serif; letter-spacing: 0.16em; text-transform: uppercase; color: #2C1A0E; }
/* W6: quiet text — no pill, no border, ink at ~62%; a 44px target; the hold fill shows behind the word. */
.ask-done { position: relative; overflow: hidden; border: 0; background: transparent; color: rgba(44,26,14,.62); border-radius: 999px;
  padding: 9px 12px; margin-right: -12px; font: 700 14px 'Lato', sans-serif; cursor: pointer; user-select: none; -webkit-user-select: none; touch-action: none; min-height: 44px; }
${holdFillCss(".ask-done-fill", ".ask-done.holding .ask-done-fill")}
.ask-done-text { position: relative; }
.ask-h1 { position: relative; z-index: 1; font-family: 'Playfair Display', serif; font-weight: 700; font-size: 40px; line-height: 1.1; text-align: center; margin: 28px 20px 0; }
.ask-h1-left { text-align: left; font-size: 32px; margin-top: 20px; }
.ask-rule { position: relative; z-index: 1; width: 64px; height: 3px; border-radius: 2px; background: #0D9488; margin: 16px auto 0; }
.ask-rule-left { margin-left: 20px; }
.ask-line { position: relative; z-index: 1; text-align: center; font: 400 calc(17px * var(--op-text-scale, 1)) 'Lato', sans-serif; margin: 18px 24px 0; }
.ask-primary { border: 0; background: #0D9488; color: #fff; font: 700 18px 'Lato', sans-serif; min-height: 54px; padding: 0 34px; border-radius: 999px; cursor: pointer; }
.ask-foot { position: relative; z-index: 1; display: flex; justify-content: center; padding: 16px 20px 28px; }

/* W5: the scene fills the screen; the title block sits on the water just under the horizon, the
   wagon on the sand with room above the button (Explorer's 96px ▶ included). */
.ask-turn { overflow: hidden; }
.ask-turn .ask-scene { position: absolute; inset: 0; width: 100%; height: 100%; }
.ask-turn-body { position: absolute; left: 0; right: 0; top: 19%; }
.ask-turn-body .ask-h1 { margin-top: 0; }
.ask-turn-wagon { position: absolute; left: 0; right: 0; bottom: max(26.5%, 150px); display: flex; justify-content: center; pointer-events: none; }
.ask-turn-wagon .ask-roll { width: 83%; max-width: 280px; }
.ask-turn .ask-foot { position: absolute; left: 0; right: 0; bottom: 0; }
.ask-sun { transform: translateY(14px); animation: ask-sunrise 1.6s cubic-bezier(.2,.8,.2,1) 0.2s forwards; }
@keyframes ask-sunrise { to { transform: none; } }

/* The wagon's motion. Wheels spin about their own centre; the handle swings about its pivot (60,119). */
.ask-wheel-spin { transform-box: fill-box; transform-origin: center; }
.ask-wagon-handle { transform-box: view-box; transform-origin: 60px 119px; }
.ask-roll { display: block; }
.ask-roll-turn { animation: ask-roll-in 0.9s cubic-bezier(.2,.9,.25,1.04) 1.05s both; }
.ask-roll-turn .ask-wheel-spin { animation: ask-wheel-roll 0.9s cubic-bezier(.2,.9,.25,1) 1.05s both; }
.ask-roll-turn .ask-wagon-arrive { animation: ask-rock 0.5s ease-out 1.9s both; transform-origin: 50% 95%; }
.ask-roll-turn .ask-wagon-handle { animation: ask-swing 0.7s ease-out 1.88s both; }
@keyframes ask-roll-in { from { transform: translateX(-125vw); } to { transform: none; } }
@keyframes ask-wheel-roll { from { transform: rotate(-900deg); } to { transform: none; } }
@keyframes ask-rock { 0% { transform: none; } 30% { transform: rotate(-1.6deg); } 65% { transform: rotate(0.8deg); } 100% { transform: none; } }
@keyframes ask-swing { 0% { transform: none; } 30% { transform: rotate(4deg); } 62% { transform: rotate(-1.5deg); } 100% { transform: none; } }

.ask-tiles { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: max-content; gap: 14px; padding: 20px 20px 12px; align-content: start; }
.ask-tile { position: relative; display: flex; flex-direction: column; border: 2px solid #EFE3D0; border-radius: 18px; background: #FFFDF9; padding: 0;
  overflow: hidden; cursor: pointer; transition: transform 0.15s ease, border-color 0.2s; -webkit-tap-highlight-color: transparent; }
.ask-tile:active { transform: scale(0.97); }
.ask-tile.picked { border-color: #0D9488; box-shadow: 0 0 0 1px #0D9488; }
.ask-tile-art { display: block; width: 100%; height: 112px; flex: 0 0 auto; background: #F3E6CF; }
.ask-tile-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ask-tile-glyph { display: flex; height: 100%; align-items: center; justify-content: center; font-size: 46px; }
.ask-tile.plain { min-height: 150px; justify-content: center; background: #F3E6CF; }
.ask-tile-name.ask-tile-name-only { font-family: 'Playfair Display', serif; font-weight: 700; font-size: calc(21px * (1 + (var(--op-text-scale, 1) - 1) * 0.5)); padding: 16px 10px; }
.ask-tile-name { display: block; font: 400 calc(16px * var(--op-text-scale, 1)) 'Lato', sans-serif; line-height: 1.25; padding: 8px 6px 10px; color: #2C1A0E; text-align: center; }
.ask-tile-check { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; background: #0D9488; color: #fff;
  display: grid; place-items: center; font-size: 15px; transform: scale(0); transition: transform 0.25s cubic-bezier(.3,1.6,.5,1); }
.ask-tile.picked .ask-tile-check { transform: scale(1); }
/* Shopper's numbered badge: calm in (no overshoot); the ✓ → number crossfade runs once when a card
   becomes picked. The resting state is the number, so reduced motion (animations off) shows it at once,
   and a renumber after an unpick just changes the digit. */
.ask-tile-order { transition: transform 0.2s ease-out; font: 700 15px 'Lato', sans-serif; }
.ask-order-check, .ask-order-num { grid-area: 1 / 1; }
.ask-order-check { opacity: 0; }
.ask-order-num { opacity: 1; }
.ask-tile.picked .ask-order-check { animation: ask-order-out 0.2s ease 0.35s both; }
.ask-tile.picked .ask-order-num { animation: ask-order-in 0.2s ease 0.35s both; }
@keyframes ask-order-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: scale(0.8); } }
@keyframes ask-order-in { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: none; } }
.ask-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Simple (S3-1): at most four tiles, two columns, rows that share the height left, so the grid
   shrinks to fit and never scrolls on a 375 px phone. The photo or glyph fills the tile and the
   glyph scales with it (container units; a fixed size where they are unsupported). */
.ask-tiles.ask-tiles-simple { overflow: hidden; grid-template-rows: repeat(2, minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr); align-content: stretch; }
.ask-tiles-simple .ask-tile { min-height: 0; container-type: size; }
.ask-tiles-simple .ask-tile-art { flex: 1 1 auto; height: auto; min-height: 0; }
.ask-tiles-simple .ask-tile-glyph { font-size: 64px; font-size: 52cqmin; }
.ask-tiles-simple .ask-tile.plain { min-height: 0; }
.ask-tiles-simple .ask-tile-name.ask-tile-name-only { font-size: calc(24px * (1 + (var(--op-text-scale, 1) - 1) * 0.5)); }
.ask-tiles-simple .ask-tile-check { width: 36px; height: 36px; font-size: 19px; top: 10px; right: 10px; }
.ask-icon { display: grid; place-items: center; padding: 0; border-radius: 50%; width: 72px; height: 72px; min-height: 0; }
.ask-icon svg { width: 38px; height: 38px; }
.ask-go { width: 96px; height: 96px; }
.ask-go svg { width: 46px; height: 46px; margin-left: 6px; }

.ask-cartbar { border-top: 1px solid #EFE3D0; padding: 8px 20px 18px; background: #FAF4EC; }
.ask-cartrow { display: flex; align-items: center; justify-content: center; gap: 14px; }
.ask-wagon { display: block; overflow: visible; }
.ask-wagon-small { width: 185px; }
.ask-wagon-pick { cursor: pointer; }
.ask-card.fresh { animation: ask-drop 0.38s cubic-bezier(.3,1.5,.5,1); transform-box: fill-box; transform-origin: center bottom; }
@keyframes ask-drop { from { transform: translateY(-22px) scale(0.7); opacity: 0; } to { transform: none; opacity: 1; } }
.ask-wagon.hop { animation: ask-hop 0.45s ease; }
.ask-wagon.hop .ask-wheel-spin { animation: ask-wheel-quarter 0.45s ease; }
@keyframes ask-wheel-quarter { from { transform: none; } to { transform: rotate(90deg); } }
@keyframes ask-hop { 0% { transform: none; } 35% { transform: translateY(-6px) rotate(-1.5deg); } 70% { transform: translateY(1px); } 100% { transform: none; } }
.ask-wagon.shake { animation: ask-shake 0.4s ease; }
@keyframes ask-shake { 0%, 100% { transform: none; } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(3px); } }
.ask-dots { display: flex; gap: 8px; }
.ask-dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid #C9A97A; transition: background 0.25s, border-color 0.25s; }
.ask-dot.on { background: #0D9488; border-color: #0D9488; }
.ask-actions { display: flex; align-items: center; justify-content: center; gap: 14px; min-height: 58px; margin-top: 6px; }
.ask-thats-it { transform: scale(0); transition: transform 0.3s cubic-bezier(.3,1.6,.5,1); }
.ask-thats-it.show { transform: scale(1); }
.ask-failed { text-align: center; font: 400 14px 'Lato', sans-serif; color: #B3412E; margin-top: 6px; }

.ask-finale { align-items: stretch; overflow-y: auto; }
.ask-rollin { display: flex; justify-content: center; margin-top: 18px; animation: ask-roll 1s cubic-bezier(.2,.9,.25,1.05); }
/* The summary wagon: the full width less a 12px gutter each side, up to 380px. */
.ask-rollin .ask-wagon { width: calc(100% - 24px); max-width: 380px; }
/* A raised back tier (5–6 picks) stands BACK_RISE (34) wagon units above the drawing: room above it. */
.ask-rollin.ask-rollin-tall { padding-top: calc(min(100vw - 24px, 380px) * 34 / 260); }
.ask-cartbar.ask-cartbar-tall { padding-top: calc(8px + 185px * 34 / 260); }
.ask-rollin .ask-wheel-spin { animation: ask-wheel-roll 1s cubic-bezier(.2,.9,.25,1); }
@keyframes ask-roll { from { transform: translateX(-120%); } to { transform: none; } }
.ask-give-back:disabled { opacity: 1; }
.ask-finale .ask-foot { margin-top: auto; }

@media (prefers-reduced-motion: reduce) {
  .ask-run *, .ask-run *::before, .ask-run *::after { animation: none !important; transition: none !important; }
  .ask-sun { transform: none; }
}
`;

export default AskRun;
