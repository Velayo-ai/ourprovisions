# OurProvisions — Prod Verification Test Plan
*2026-06-25 · post `dev→main` merge (Layer 2 + hide-delete) · post `get_my_households` prod fix*

## How to use this
- **Hard-refresh (Ctrl+Shift+R) before judging any result.** Stale bundles have produced false failures repeatedly. Re-do it after any deploy.
- **Confirm WHICH account you're testing as** — the member list shows the "YOU" tag. Owner-gated behavior only proves out when you're the owner of the *active* household.
- Test accounts: **DH** = Dan Holmes (`daniel.l.holmes@gmail.com`), **DT** = Dan Test User. Use two browser windows (one per account) for two-party tests; incognito for fresh-user paths.
- Mark each row P (pass) / F (fail) / S (skipped). A fail stops that lane until root-caused.

---

## Section 0 — Already verified this session (do not re-run)
| # | Check | Result |
|---|---|---|
| 0.1 | `get_my_households` exists on prod (`public`, no args) | ✅ P |
| 0.2 | Switcher enumerates multiple households — DH (3) | ✅ P |
| 0.3 | Switcher enumerates multiple households — DT (5) | ✅ P |
| 0.4 | Previously-invisible created household (GSL Lake House) now appears | ✅ P |
| 0.5 | Owner sees NO Delete + NO Leave — DH, all households | ✅ P |
| 0.6 | Owner sees NO Delete + NO Leave — DT (Aquila 50 - BVI) | ✅ P |

---

## Section 1 — The original bug, full loop (create → appear)
*Reads are proven; the create→appear single action is not yet.*
| # | Step | Expected | P/F |
|---|---|---|---|
| 1.1 | As DH, tap **+ Create new household**, name it e.g. "TestProd-A" | Name field accepts input | |
| 1.2 | Confirm create | Toast `"TestProd-A" created` | |
| 1.3 | Immediately after create | New household **appears in switcher** AND becomes **active** (you land in its empty list) | |
| 1.4 | Close + reopen modal | TestProd-A still listed (persisted, not just optimistic) | |
| 1.5 | Hard-refresh, reopen | Still listed (survives reload — proves it's a real read, not local state) | |

---

## Section 2 — Hide-delete merge (the today change), full matrix
*Owner path proven (0.5/0.6). Non-owner path + cross-account still worth confirming.*
| # | Step | Expected | P/F |
|---|---|---|---|
| 2.1 | As DT, active = a household DT does **not** own (e.g. Holmes, owned by dan) | Bottom shows **LEAVE HOUSEHOLD** (red), no Delete | |
| 2.2 | As DT on that household, own member row | **No trashcan** on DT's own row (isMe suppression) | |
| 2.3 | As DT on that household, other members' rows | Trashcan **present** (can remove non-owners) | |
| 2.4 | Owner row (dan) in any household | **No trashcan** on the owner row (owner protected) | |
| 2.5 | As DT, switch active to a household DT **owns** (Aquila) | Bottom shows Invite only — no Delete, no Leave (re-confirms 0.6 after a switch) | |

---

## Section 3 — Layer 2 removal notice + auto-provision (the merge payload)
*Validated on DEV; NOT yet tapped on prod. This is the 8-commit core. Two windows required.*
| # | Step | Expected | P/F |
|---|---|---|---|
| 3.1 | **Survivor path.** DH window + DT window both on a shared household where DT has ≥1 *other* household. DH (owner) removes DT. | Within ~30s, DT sees removal notice naming the **real household** (not "that household"), then **auto-switches** to a surviving household | |
| 3.2 | Notice content | Rectangle shows real household name + auto-dismisses after the switch | |
| 3.3 | **Auto-provision path.** Set up DT as member of **exactly one** household (its only membership). DH removes DT from it. | DT sees "No longer a member of X" + "fresh household" subtext, lands in a **fresh empty "My Household"**, notice survives the switch | |
| 3.4 | In-flight guard | Exactly **one** fresh household auto-created (no duplicate spawn) | |
| 3.5 | **Voluntary leave is silent.** DT taps LEAVE on a household. | Clean pill, **no** removal rectangle (leave ≠ removal) | |

---

## Section 4 — Single-household regression
*Confirm Layer 2's 30s presence poll didn't disturb the simple path.*
| # | Step | Expected | P/F |
|---|---|---|---|
| 4.1 | A user with exactly one household: add an item | Item lands, persists, SHOP count updates | |
| 4.2 | Remove an item (qty → 0 / swipe) | Item removed cleanly, no badge resurrection on re-add | |
| 4.3 | Leave open ~60s, watch console | No error spam from `checkPresence`; no spurious household switch | |

---

## Section 5 — Multi-household write isolation (the authorization spine, live on prod)
*004/005/007 policies are confirmed live on prod — this proves they behave.*
| # | Step | Expected | P/F |
|---|---|---|---|
| 5.1 | Add a custom item in Household A | Appears in A's list | |
| 5.2 | Switch to Household B | That item is **absent** from B (catalog + list scoped by membership) | |
| 5.3 | Add item to B, switch back to A | A unchanged, B's item only in B | |
| 5.4 | Two windows, same household, DH + DT both +1 the same item near-simultaneously | No 409; quantity reconciles (known: concurrent-UPDATE may undercount — log if seen, it's a known-open issue) | |

---

## Section 6 — Invite / join / rejoin
| # | Step | Expected | P/F |
|---|---|---|---|
| 6.1 | DH invites someone; copy invite link | Link generated | |
| 6.2 | New user (incognito) signs up **via invite link** | Lands in the invited household; **no** spurious "My Household" spawned (invite-first = single household) | |
| 6.3 | Member leaves a household, then rejoins via a fresh invite | Rejoin succeeds (no UNIQUE collision — revive-or-insert) | |
| 6.4 | Existing user accepts invite via **code entry** (not URL) | Joins correctly (acceptList path) | |

---

## Priority order (if time-boxed)
1. **Section 3** — Layer 2 is the actual merge payload and is *unverified on prod*. Highest value.
2. **Section 1** — closes the original bug report cleanly.
3. **Section 2** — finishes the today-change matrix (owner already green).
4. **Section 4** — cheap regression safety.
5. Sections 5–6 — deeper, run if confidence needs topping up.

## Honest note for the handoff
As of this session: Sections 0 fully green. Sections 1–6 are the *unverified* surface — the merge built clean and Layer 2 was validated on **dev**, but Section 3 specifically has **not** been tapped on **prod**. Record these as *deferred*, not *passed*, until run.
