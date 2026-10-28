// Bad-invite messaging (2026-10-27): ONE message per failed invite, never two.
//
// Bootstrap retries an unresolved invite through join_household; when that
// fails, who sees what depends on whether this bootstrap minted a fresh place:
//
// - created_household === true — a brand-new user. The welcome sheet will open
//   (just_signed_up is set from the same flag, the place is still "My
//   Household", and a failed join leaves no just_joined_household_id), so its
//   fixed line — "That invite link didn't work. Ask for a fresh one, or start
//   here." — is the message. The server's "Invite not found." toast is
//   suppressed; it used to double the line.
// - anything else — an existing member. No welcome sheet ever opens for them,
//   so the toast stays as their only message, and no invite_failed flag is
//   written (nothing would read it).
export function inviteFailureNotice(createdHousehold) {
  const fresh = createdHousehold === true;
  return { toast: !fresh, welcomeLine: fresh };
}
