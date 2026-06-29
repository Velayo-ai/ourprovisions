# SPEC — Member display name reads full_name (not email prefix)

Scope: OurProvisions
Intent: The manage-households roster and two related labels render each member's
name from the email prefix, ignoring the live Supabase `users.full_name`. Result:
a member who edits their name (e.g. Elly → "Elly") still shows as "ellyholmes9"
to everyone else. Fix: read `full_name` first at all three sites, keeping the
email-prefix as the deliberate fallback (best handle an owner has for an
invited-but-unnamed member). Reference implementation already exists at App.js
line ~736 ("added by" label) — do not touch it.

## EDITS

File: App.js

--- Site 1: remove-member confirmation name (handleRemoveMember) ---
OLD:
    const name = m.users?.email ? m.users.email.split("@")[0] : "this member";
NEW:
    const name = m.users?.full_name || (m.users?.email ? m.users.email.split("@")[0] : "this member");

--- Site 2: household creator label ("Created by ...") ---
OLD:
                        const creatorName = ownerIsMe ? "you" : (owner.users?.email ? owner.users.email.split("@")[0] : "Member");
NEW:
                        const creatorName = ownerIsMe ? "you" : (owner.users?.full_name || (owner.users?.email ? owner.users.email.split("@")[0] : "Member"));

--- Site 3: roster display name (householdMembers.map) ---
Note: this also removes a Clerk read (`user.fullName`) for the self case, so that
self and others both source from Supabase `full_name`. `isMe` is still computed
above and still used for the avatar (user.imageUrl) — it is NOT dead after this edit.
OLD:
                  const displayName = isMe
                    ? (user.fullName || user.firstName || user.primaryEmailAddress?.emailAddress || "You")
                    : (m.users?.email ? m.users.email.split("@")[0] : "Member");
NEW:
                  const displayName = m.users?.full_name
                    || (m.users?.email ? m.users.email.split("@")[0] : (isMe ? "You" : "Member"));

## DB
None.

## TEST
1. Cold-load ourprovisions.velayo.ai (desktop browser, not the installed PWA).
2. Open Manage Households → Madbury → view members.
3. Expect: Elly's row shows "Elly" (her edited full_name), not "ellyholmes9".
   Helen and Charles show their full_name values. Your own row shows your
   Supabase full_name (Dan Holmes), not the Clerk-derived name.
4. Confirm a member with a null full_name still falls back to email prefix
   (no "undefined", no blank row).
5. Verify the "Created by" label and the remove-member confirm dialog also show
   full_name when present.

## LOG_SEED
Fixed member display names across roster, creator label, and remove-member
confirm to read Supabase full_name first (email-prefix fallback retained);
established that the app reads names from Supabase, never Clerk.
