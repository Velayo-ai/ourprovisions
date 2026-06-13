# OurProvisions — Dev Setup

*How to stand up a working development environment on any machine.*
*Last updated: 2026-06-13*

---

## The principle

**The machine is disposable. The repo is the source of truth.**

Any machine — NH, NY, the lake house, the boat — rebuilds a full working
environment from `git clone` + one secret file + `npm install`. Nothing
precious lives on a single device. If a laptop falls in the lake, you lose
nothing but the laptop.

This is the same discipline the rest of Velayo runs on: prod rebuilds from
`migrations/000_canonical_baseline.sql`; the dev environment rebuilds from this
file.

---

## What's already portable (no setup needed)

| Layer | Lives in | Same from every machine? |
|---|---|---|
| Code | GitHub (`Velayo-ai/ourprovisions`) | Yes — clone it |
| Database (prod + dev) | Supabase (cloud) | Yes — remote, no local DB |
| Auth | Clerk (cloud) | Yes |
| Hosting / CI | Vercel | Yes — deploys from `dev`/`main` |
| Docs & Claude context | `docs/`, `CLAUDE.md` (in repo) | Yes |

The **only** thing git does not carry is `.env.local` (correctly gitignored).
That's the one manual step below.

---

## Fresh-machine recipe (~30–45 min, mostly downloads)

### 1. Install the tooling
- **Git** — https://git-scm.com
- **nvm** (Node version manager)
  - Windows: [nvm-windows](https://github.com/coreybutler/nvm-windows/releases)
  - Mac/Linux: https://github.com/nvm-sh/nvm
- **Editor** — VS Code (or your choice)
- **Claude Code** — https://claude.com/claude-code

### 2. Get Node onto the right version
The repo pins Node via `.nvmrc` (currently major **24**, matching Vercel's
default build runtime). From inside the project folder:

```
nvm install 24
nvm use 24
node -v        # should print v24.x
```

(On nvm-windows the `.nvmrc` auto-read isn't automatic — just run
`nvm use 24` explicitly. On Mac/Linux nvm, `nvm use` reads `.nvmrc` for you.)

### 3. Clone the repo
```
git clone https://github.com/Velayo-ai/ourprovisions.git
cd ourprovisions
```

### 4. Drop in `.env.local`  ← the one non-git step

`.env.local` must point at the **dev** Supabase project
(`zxwtxjjmssykhqrghouf`), NOT prod (`parpauldmbetptkmdwbd`). Confirm it does
before running `npm start`.

**Current interim source (until a real secrets manager is set up):** a copy of
`.env.local` lives in personal Google Drive (My Drive, unshared). Download it
into the repo root. See "Secrets" below for the plan to replace this.

> **Do NOT use `vercel env pull` to get this file right now.** Vercel's
> *Development*-scope Supabase vars still point at **prod** (see "Secrets"),
> so a pull silently gives you the prod DB — the exact "tests hit prod" trap.
> Use the Drive copy until the Vercel env scopes are reconciled.

### 5. Install dependencies & run
```
npm install
npm start          # CRA dev server → localhost:3000
```

If `localhost:3000` loads and you can sign in, the machine is ready.

> **If `npm install` errors with `ERESOLVE` / peer-dependency conflicts:**
> this project runs `react-scripts` 5.0.1 with React 19, which CRA's resolver
> doesn't formally bless. The NH machine works because its `node_modules` is
> already resolved; a fresh machine installs clean and can trip on it. Fix:
> ```
> npm install --legacy-peer-deps
> ```
> If you need that flag, make it sticky for the project so future installs
> don't need it repeated — add a `.npmrc` in the repo root containing:
> ```
> legacy-peer-deps=true
> ```
> (Commit that `.npmrc` so every machine and Vercel inherit the same behavior.)

---

## Secrets — how `.env.local` travels

`.env.local` holds **publishable/anon keys only** (Supabase anon, Clerk `pk_`).
No `service_role` / `sk_` secrets live in client files — RLS is the real lock.
Blast radius is low, but still: don't broadcast it. Don't email it to yourself
or paste it into a shared doc.

**Current state (interim):** a copy lives as a file in personal Google Drive
(My Drive, unshared). Adequate because the keys are anon/publishable only.
This is a stopgap, not the final system — set a reminder to delete it once a
real secrets manager is in place.

**Planned fix: Bitwarden.** Free, cross-platform, real secure notes, works
offline once synced (matters on the boat). When set up: store the full
`.env.local` contents as a secure note; new machine = copy, paste, save.

**Why NOT `vercel env pull` (for now):** Vercel has three env scopes —
Production / Preview / Development. As of 2026-06-13:
- **Production** Supabase vars → prod DB (`parpauldmbetptkmdwbd`). Correct.
- **Preview** Supabase vars → dev DB (`zxwtxjjmssykhqrghouf`). Correct
  (repointed Jun 12; this is what `dev`-branch preview deploys use).
- **Development** Supabase vars → still the original 79-day-old **prod**
  values. `vercel env pull` reads this scope, so it returns prod. Until the
  Development-scope vars are repointed (or removed) to dev, do not trust a pull.
- Also: **Preview is missing `REACT_APP_CLERK_PUBLISHABLE_KEY`** — only
  Production has it. Worth reconciling when fixing the above.

Once the Development scope is fixed, `vercel env pull .env.local` becomes the
cleanest distribution route and this doc should be updated to recommend it.

---

## The multi-machine rule (the thing that actually bites)

With one machine you always know where your work is. With three, the failure
mode is: start a feature on the boat → push to `dev` → fly to NH → forget to
pull → build on a stale copy → painful merge.

**The discipline:**
- **Before you walk away from a machine:** commit + push everything.
  ```
  git status            # should be clean before you stand up
  git push origin dev
  ```
- **Before you start on a different machine:** pull first.
  ```
  git checkout dev
  git pull origin dev
  ```

Treat `dev` on GitHub as the *only* place your work truly lives between
sessions. This is already baked into the Preflight section of the Dev Session
Flight Checklist — multi-machine just raises the cost of skipping it.

---

## The boat: working offline

The laptop is the one machine where good internet isn't guaranteed.

- **Git is offline-first** — commit locally as much as you want; push when you
  have signal. Just don't let uncommitted work pile up waiting for connectivity.
- **The dev DB is remote (Supabase cloud)** — at anchor with no signal, you
  can't reach it. If genuinely-offline boat development becomes a real need
  (not just hypothetical), the fix is a local Supabase via the Supabase CLI /
  Docker, seeded from `migrations/000_canonical_baseline.sql`. That reintroduces
  a sync burden, so only do it if offline dev is real.

---

## Per-machine checklist (copy when standing up a new one)

- [ ] Git installed
- [ ] nvm installed; `nvm use 24`; `node -v` shows v24.x
- [ ] Repo cloned
- [ ] `.env.local` in place from Google Drive copy (points at dev DB
      `zxwtxjjmssykhqrghouf` — NOT prod; do not use `vercel env pull`)
- [ ] `npm install` clean
- [ ] `npm start` → localhost:3000 loads, sign-in works
- [ ] Claude Code installed and authenticated
- [ ] `git pull origin dev` confirms you're current

---

*Velayo, Inc. — the boat is the office. Any machine, same setup, in under an hour.*
