/* THE PUBLIC GIFT CARD — what a SIGNED-OUT visitor sees at /g/{CODE}
   (SPEC_meal_sharing_phase_a_client C5–C8; mockup_gift_preview.html A1–A3; SPEC_meal_sharing_v2 S43).

   The URL never reaches this component: src/lib/preRum.js held the code under GIFT_KEY and
   cleaned the path before Splunk started (S33). App.js reads the key at mount and renders this
   in the Home welcome's place while the session is not live. The code stays held through
   Clerk's sign-up round trip; the signed-in arrival (Commit 3) consumes it after bootstrap.

   Data: src/lib/supabaseAnon.js — the only module allowed to import it (a test greps src/).
   preview_meal_gift_public returns the five S43 fields or no row; no row is A3 for BOTH an
   unknown and a revoked code (C7 — the page cannot tell them apart, so it does not try). A
   request that failed outright (offline) is not a dead link and gets its own line + Try again.

   Replay / click text: the photo <img> is .op-photo + .op-replay-block (never serialised); the
   title, From and count are masked text on prod (not allow-listed); the buttons carry fixed copy
   and are allow-listed (.gift-add, .gift-signin, .gift-what, .gift-retry); no attribute anywhere
   carries the title, the attribution or the code. No giver name, no note (C5). */
import { useEffect, useState } from "react";
import { previewMealGiftPublic, giftPhotoUrl } from "../lib/supabaseAnon";
import { giftCardModel } from "../lib/giftCard";

export const LANDING_URL = "https://ourprovisions.app";
const FOOT = <>
  <b>OurProvisions</b> keeps a household’s meals and shopping list in one place.
</>;

export function GiftCard({ code, ready = false, onAddToMeals, onSignIn }) {
  const [state, setState] = useState({ phase: "loading" });   // loading | live (model) | dead | error
  const [photoUrl, setPhotoUrl] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ phase: "loading" });
    setPhotoUrl(null);
    previewMealGiftPublic(code).then((r) => {
      if (cancelled) return;
      if (r.error) { setState({ phase: "error" }); return; }
      const model = giftCardModel(r.row);
      if (!model) { setState({ phase: "dead" }); return; }
      setState({ phase: "live", model });
      // C8 / S47: photo_ext decides the slot; the URL is signed on the client from the gift id and
      // the format the giver stored it in ({gift_id}/view.{photo_ext}).
      if (model.hasPhoto) giftPhotoUrl(model.giftId, model.photoExt).then((u) => { if (!cancelled && u) setPhotoUrl(u); });
    });
    return () => { cancelled = true; };
  }, [code, attempt]);

  if (state.phase === "dead") {
    return (
      <div className="home gift-page">
        <div className="gift-dead">
          <span className="gift-plate gift-plate-big" aria-hidden="true" />
          <h2 className="gift-dead-h">That link doesn’t work.</h2>
          <p className="gift-dead-p">Ask whoever sent it for a new one.</p>
          <a className="gift-what" href={LANDING_URL}>What is OurProvisions?</a>
        </div>
        <p className="gift-foot">{FOOT}</p>
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="home gift-page">
        <div className="gift-dead">
          <h2 className="gift-dead-h">Couldn’t open this link.</h2>
          <p className="gift-dead-p">Check your connection and try again.</p>
          <button type="button" className="gift-retry" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
        </div>
        <p className="gift-foot">{FOOT}</p>
      </div>
    );
  }
  const model = state.phase === "live" ? state.model : null;
  return (
    <div className="home gift-page">
      <div className="gift-eyebrow">A meal, given to you</div>
      <div className={`gift-card${model ? "" : " gift-card-loading"}`} aria-busy={model ? undefined : "true"}>
        {model && (model.hasPhoto ? (
          <div className="gift-photo">
            {photoUrl && <img className="gift-photo-img op-photo op-replay-block" src={photoUrl} alt="" draggable="false" />}
          </div>
        ) : (
          // C8: no photo → a short sand band with the plate mark, never an empty 4:3 box.
          <div className="gift-noph" aria-hidden="true"><span className="gift-plate" /></div>
        ))}
        {model && (
          <div className="gift-body">
            <h2 className="gift-title">{model.title}</h2>
            {model.from && <div className="gift-from">{model.from}</div>}
            <span className="gift-meta">{model.count}</span>
          </div>
        )}
      </div>
      <button type="button" className="gift-add" disabled={!ready || !model} onClick={onAddToMeals}>Add to our meals</button>
      <p className="gift-after">You’ll make a free account, then it’s your copy to change.</p>
      <p className="gift-signin-line">Already on OurProvisions? <button type="button" className="gift-signin" disabled={!ready} onClick={onSignIn}>Sign in</button></p>
      <p className="gift-foot">{FOOT}</p>
    </div>
  );
}
