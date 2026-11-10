import { useEffect, useRef, useState } from "react";
import { pickLine } from "../lib/askCreate";
import { tapTile, takeOut, canConfirm, shelfTitlePrefix, effectiveTarget, tileFace, heldAskWrite, storeHeldAsk } from "../lib/askRun";

// Running an Ask (SPEC_ask amendment A13–A17, A24; SPEC_ask_slice2 C3b). Three screens, full
// screen over the app: (1) "Your turn, {Label}!" — the hand-over, the wagon on the water at
// sunrise, Let's pick; (2) the shelf — "Pick {n}, {Label}!", the tiles, the small wagon + dots,
// That's it!; (3) "Great picks, {Label}!" — the wagon holding his picks, what landed, Back to
// the list ("Great pick" / "I've added this" when exactly one landed, Dan 2026-11-09). The reference image governs the look, mockup_ask_cart.html the behaviour.
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
// grown-up's controls (Done, Back to the list), the titles and Great picks stay words on both.
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

const HOLD_MS = 1000;

// The wagon (A15): cream body, a teal stripe, wooden wheels and handle. Picks sit inside, behind
// the front panel; each is tappable to take it out while the shelf is open.
function Wagon({ picks, onTakeOut, fresh, kick, className = "" }) {
  const n = picks.length;
  const slot = n === 0 ? 0 : Math.min(44, (156 - (n - 1) * 4) / n);
  const x0 = 125 - (n * slot + Math.max(0, n - 1) * 4) / 2;
  return (
    <svg className={`ask-wagon ${className}${kick ? ` ${kick.kind}` : ""}`} key={kick ? kick.n : 0}
      viewBox="0 0 250 130" role={onTakeOut ? "group" : "img"} aria-label={n === 0 ? "The wagon, empty" : `The wagon, ${n} in it`}>
      <path d="M44 44 H212 L198 94 H58 Z" fill="#EADBC2" />
      {picks.map((t, k) => (
        <g key={t.id} className={`ask-wagon-pick${t.id === fresh ? " fresh" : ""}`}
          role={onTakeOut ? "button" : undefined} tabIndex={onTakeOut ? 0 : undefined}
          aria-label={onTakeOut ? `Take out ${t.name}` : t.name}
          onClick={onTakeOut ? () => onTakeOut(t.id) : undefined}
          onKeyDown={onTakeOut ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTakeOut(t.id); } } : undefined}>
          <TileArt tile={t} x={x0 + k * (slot + 4)} y={46 - slot * 0.8} size={slot} />
        </g>
      ))}
      <g pointerEvents="none">
        <path d="M44 44 H212 L198 94 H58 Z" fill="#FBF6EE" />
        <path d="M50 70 H206" stroke="#0D9488" strokeWidth="7" />
        <path d="M44 44 H212 L198 94 H58 Z" fill="none" stroke="#C9A97A" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M38 44 H218" stroke="#C9A97A" strokeWidth="5" strokeLinecap="round" />
      </g>
      <path d="M8 22 Q22 18 28 28 L46 50" fill="none" stroke="#A0724A" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="80" cy="108" r="14" fill="#B5814B" stroke="#6E4A2A" strokeWidth="3" />
      <circle cx="80" cy="108" r="4" fill="#F3E6CF" />
      <circle cx="176" cy="108" r="14" fill="#B5814B" stroke="#6E4A2A" strokeWidth="3" />
      <circle cx="176" cy="108" r="4" fill="#F3E6CF" />
    </svg>
  );
}

// One tile's picture inside an SVG (tileFace): the household's photo, else the item's own glyph,
// else its name in small type. Never the aisle's glyph (C3b.1).
function TileArt({ tile, x, y, size }) {
  const id = `ask-clip-${tile.id}-${Math.round(x)}`;
  const face = tileFace(tile);
  return (
    <>
      <defs><clipPath id={id}><rect x={x} y={y} width={size} height={size} rx={size * 0.18} /></clipPath></defs>
      <rect x={x} y={y} width={size} height={size} rx={size * 0.18} fill="#F3E6CF" stroke="#E8D5B7" />
      {face === "photo" ? (
        <image className="op-replay-block" href={tile.photoUrl} x={x} y={y} width={size} height={size} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
      ) : face === "glyph" ? (
        <text x={x + size / 2} y={y + size * 0.68} textAnchor="middle" fontSize={size * 0.55}>{tile.glyph}</text>
      ) : (
        <text x={x + size / 2} y={y + size * 0.58} textAnchor="middle" fontSize={Math.max(6, size * 0.2)} fontFamily="Lato, sans-serif"
          fill="#2C1A0E" clipPath={`url(#${id})`}>{tile.name}</text>
      )}
    </>
  );
}

// A tile's face in HTML: the photo, the item's glyph, or nothing (the name carries a plain tile).
function TileFace({ tile, glyphClass }) {
  const face = tileFace(tile);
  if (face === "photo") return <img className="op-replay-block op-photo" src={tile.photoUrl} alt="" draggable="false" />;
  if (face === "glyph") return <span className={glyphClass}>{tile.glyph}</span>;
  return null;
}

// Done (A17): press and hold about a second. A short tap only says "Hold to finish".
function HoldDone({ onDone }) {
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState(false);
  const timer = useRef(null);
  const hintTimer = useRef(null);
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(hintTimer.current); }, []);
  const start = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => { timer.current = null; setHolding(false); onDone(); }, HOLD_MS);
  };
  const stop = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    setHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), 1600);
  };
  return (
    <button type="button" className={`ask-done${holding ? " holding" : ""}`} aria-label="Hold to finish"
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) start(e); }}
      onKeyUp={(e) => { if (e.key === "Enter" || e.key === " ") stop(); }}
      onContextMenu={(e) => e.preventDefault()}>
      <span className="ask-done-fill" aria-hidden="true" />
      <span className="ask-done-text">{hint ? "Hold to finish" : "Done"}</span>
    </button>
  );
}

// The shelf screen's title and the other two screens' names: the name always in .op-name.
const Name = ({ children }) => <span className="op-name">{children}</span>;

// ask: { id, label, shelfNoun, pickTarget, screenStyle }. tiles: the LIVE tiles [{ id, name, glyph,
// photoUrl }] in shelf order; glyph is the ITEM's own (null when the catalog has none), never the aisle's.
// onLand(ids) resolves when the picks are on the list and throws when they are not.
// resume: { screen, ids } from op_ask_held after a reload (heldAskRead has checked it), else null.
export function AskRun({ ask, tiles, onLand, onExit, resume = null }) {
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
      await onLand(picks);
      setScreen("done");
    } catch (_e) {
      setFailed(true);   // the wagon stays held; That's it! can be tapped again
    } finally {
      setLanding(false);
    }
  };

  const top = (
    <div className="ask-top">
      <span className="ask-eyebrow">Ask <Name>{ask.label}</Name></span>
      {screen === "done"
        ? <button type="button" className="ask-done" onClick={onExit}><span className="ask-done-text">Done</span></button>
        : <HoldDone onDone={onExit} />}
    </div>
  );

  return (
    <div className="ask-run op-replay-block" role="dialog" aria-modal="true" aria-label="Ask">
      <style>{ASK_RUN_CSS}</style>
      {screen === "turn" && (
        <div className="ask-screen ask-turn">
          <svg className="ask-scene" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
            <defs>
              <linearGradient id="ask-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#E9EEF0" /><stop offset="0.55" stopColor="#F8E4C8" /><stop offset="1" stopColor="#FAF4EC" />
              </linearGradient>
              <linearGradient id="ask-water" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#C9D9DA" /><stop offset="1" stopColor="#FAF4EC" />
              </linearGradient>
            </defs>
            <rect width="400" height="300" fill="url(#ask-sky)" />
            <circle className="ask-sun" cx="150" cy="170" r="22" fill="#F7D9A4" />
            <path d="M180 172 Q260 150 400 158 V176 H180 Z" fill="#9AA9B5" opacity="0.55" />
            <rect y="172" width="400" height="128" fill="url(#ask-water)" />
            <path d="M120 186 h60 M110 196 h80 M130 206 h40" stroke="#FBE7C2" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
          </svg>
          {top}
          <div className="ask-turn-body">
            <h1 className="ask-h1">Your turn,{" "}<br /><Name>{ask.label}</Name>!</h1>
            <div className="ask-rule" aria-hidden="true" />
            <p className="ask-line">{pickLine(target, ask.shelfNoun)}</p>
          </div>
          <div className="ask-turn-wagon"><Wagon picks={[]} /></div>
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
          <div className={`ask-tiles${simple ? " ask-tiles-simple" : ""}`} role="group" aria-label="The shelf">
            {tiles.map((t) => {
              const on = picks.includes(t.id);
              const plain = tileFace(t) === "name";
              return (
                <button key={t.id} type="button" className={`ask-tile${on ? " picked" : ""}${plain ? " plain" : ""}`} aria-pressed={on}
                  aria-label={simple && !plain ? t.name : undefined} onClick={() => tap(t.id)}>
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
                  <span className="ask-tile-check" aria-hidden="true">✓</span>
                </button>
              );
            })}
          </div>
          <div className="ask-cartbar">
            <div className="ask-cartrow">
              <Wagon picks={inWagon} onTakeOut={out} fresh={fresh} kick={kick} className="ask-wagon-small" />
              <div className="ask-dots" aria-label={`${picks.length} of ${target} picked`}>
                {Array.from({ length: target }, (_, k) => <span key={k} className={`ask-dot${k < picks.length ? " on" : ""}`} />)}
              </div>
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
          <div className="ask-rollin"><Wagon picks={inWagon} /></div>
          <p className="ask-line">{one ? "I've added this to our list." : "I've added these to our list."}</p>
          <ul className="ask-landed">
            {inWagon.map((t) => (
              <li key={t.id}>
                {tileFace(t) !== "name" && (
                  <span className="ask-landed-art" aria-hidden="true"><TileFace tile={t} /></span>
                )}
                {t.name}
              </li>
            ))}
          </ul>
          <div className="ask-foot">
            <button type="button" className="ask-primary" onClick={onExit}>Back to the list</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Tokens: the app's cream / espresso / sand, brand teal on fills (the 10-07 ruling: teal text uses
// #0A776D; brand #0D9488 on fills and large type only). Playfair for the three titles, Lato for
// the rest. Motion per the mockup (drop + hop, shake, roll-in, sunrise), off under reduced motion.
const ASK_RUN_CSS = `
.ask-run { position: fixed; inset: 0; z-index: 2000; background: #FAF4EC; color: #2C1A0E; overflow: hidden;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
.ask-screen { position: relative; height: 100%; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; }
.ask-top { position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: center; padding: 18px 20px 0; }
.ask-eyebrow { font: 700 calc(12.5px * var(--op-text-scale, 1)) 'Lato', sans-serif; letter-spacing: 0.16em; text-transform: uppercase; color: #2C1A0E; }
.ask-done { position: relative; overflow: hidden; border: 1px solid #E8D5B7; background: #FFFDF9; color: #2C1A0E; border-radius: 999px;
  padding: 9px 16px; font: 700 14px 'Lato', sans-serif; cursor: pointer; user-select: none; -webkit-user-select: none; touch-action: none; min-height: 40px; }
.ask-done-fill { position: absolute; inset: 0; background: #E8D5B7; transform: scaleX(0); transform-origin: left; transition: transform 0.2s; }
.ask-done.holding .ask-done-fill { transform: scaleX(1); transition: transform ${HOLD_MS}ms linear; }
.ask-done-text { position: relative; }
.ask-h1 { position: relative; z-index: 1; font-family: 'Playfair Display', serif; font-weight: 700; font-size: 40px; line-height: 1.1; text-align: center; margin: 28px 20px 0; }
.ask-h1-left { text-align: left; font-size: 32px; margin-top: 20px; }
.ask-rule { position: relative; z-index: 1; width: 64px; height: 3px; border-radius: 2px; background: #0D9488; margin: 16px auto 0; }
.ask-rule-left { margin-left: 20px; }
.ask-line { position: relative; z-index: 1; text-align: center; font: 400 calc(17px * var(--op-text-scale, 1)) 'Lato', sans-serif; margin: 18px 24px 0; }
.ask-primary { border: 0; background: #0D9488; color: #fff; font: 700 18px 'Lato', sans-serif; min-height: 54px; padding: 0 34px; border-radius: 999px; cursor: pointer; }
.ask-foot { position: relative; z-index: 1; display: flex; justify-content: center; padding: 16px 20px 28px; }

.ask-turn .ask-scene { position: absolute; left: 0; right: 0; top: 0; width: 100%; height: 62%; }
.ask-turn-body { position: relative; padding-top: 18vh; }
.ask-turn-wagon { flex: 1; display: flex; align-items: flex-end; justify-content: center; padding: 0 20px; }
.ask-turn-wagon .ask-wagon { width: 78%; max-width: 320px; }
.ask-sun { transform: translateY(18px); animation: ask-sunrise 1.6s cubic-bezier(.2,.8,.2,1) 0.2s forwards; }
@keyframes ask-sunrise { to { transform: none; } }

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
.ask-wagon-small { width: 150px; }
.ask-wagon-pick { cursor: pointer; }
.ask-wagon-pick.fresh { animation: ask-drop 0.38s cubic-bezier(.3,1.5,.5,1); transform-box: fill-box; transform-origin: center bottom; }
@keyframes ask-drop { from { transform: translateY(-22px) scale(0.7); opacity: 0; } to { transform: none; opacity: 1; } }
.ask-wagon.hop { animation: ask-hop 0.45s ease; }
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
.ask-rollin .ask-wagon { width: 78%; max-width: 320px; }
@keyframes ask-roll { from { transform: translateX(-120%); } to { transform: none; } }
.ask-landed { list-style: none; margin: 14px 20px 0; padding: 6px 16px; border: 1px solid #EFE3D0; border-radius: 16px; background: #FFFDF9; }
.ask-landed li { display: flex; align-items: center; gap: 14px; padding: 8px 0; font: 400 calc(16px * var(--op-text-scale, 1)) 'Lato', sans-serif; }
.ask-landed-art { width: 52px; height: 40px; border-radius: 8px; overflow: hidden; background: #F3E6CF; display: grid; place-items: center; font-size: 24px; flex: 0 0 auto; }
.ask-landed-art img { width: 100%; height: 100%; object-fit: cover; }
.ask-finale .ask-foot { margin-top: auto; }

@media (prefers-reduced-motion: reduce) {
  .ask-run *, .ask-run *::before, .ask-run *::after { animation: none !important; transition: none !important; }
  .ask-sun { transform: none; }
}
`;

export default AskRun;
