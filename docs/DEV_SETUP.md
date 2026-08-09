# OurProvisions — Dev Setup

*How to stand up a working development environment on any machine.*
*Last updated: 2026-08-09 — `.env.local` now comes from the **Bitwarden vault**; the Google Drive copy is retired and the Vercel Development scope is intentionally empty.*

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

**Source: the Bitwarden vault** — the secure note `ourprovisions .env.local (dev)`.
Copy it into the repo root as `.env.local`. That is the only distribution route.

`.env.local` holds **three** variables and must point at the **dev** Supabase
project (`zxwtxjjmssykhqrghouf`), NOT prod (`parpauldmbetptkmdwbd`):

```
REACT_APP_SUPABASE_URL
REACT_APP_SUPABASE_ANON_KEY
REACT_APP_CLERK_PUBLISHABLE_KEY      # pk_test_ — Velayo/Development instance
```

> **Confirm it by running the app, not by reading the file.** All three are
> load-bearing: `src/index.js` reads the Clerk key from `process.env` with no
> fallback and **throws** when it's absent. On 2026-08-09 *no* `.env.local` on
> *any* machine carried that key — the hardcoded literal had been removed and no
> distribution path ever carried the replacement. Reading the file looked fine.
> Starting the app is what caught it.

> **Vercel is not a source for dev credentials.** The **Development scope is
> intentionally empty** — `vercel env pull` returning nothing is the designed
> behaviour, not a misconfiguration. Vercel owns Production and Preview
> build-time env only. Do not repoint Development; a second source of truth
> drifts silently, and a stale-but-plausible file fails six weeks later looking
> like a code bug.

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

**Current state (since 2026-08-09): the Bitwarden vault.** The secure note
`ourprovisions .env.local (dev)` in the personal vault is the source of truth.
New machine = copy, paste, save, **then start the app to confirm**. Works
offline once synced (matters on the boat). The Google Drive copy is **retired**
— deleted 2026-08-09 after the vault copy was verified by use.

**Vercel is not a source for dev credentials.** The **Development scope is
intentionally empty**; an empty `vercel env pull` is designed behaviour, not a
misconfiguration. Vercel owns **Production** and **Preview** build-time env
only, and there is no Bitwarden→Vercel sync for a one-app fleet.

The Development scope was cleared by **deletion, not repointing** (2026-08-09).
The root cause was structural rather than stale: `REACT_APP_SUPABASE_URL` and
`REACT_APP_SUPABASE_ANON_KEY` were each a **single row scoped to "Production
and Development"**, so Development was structurally bound to the **prod**
value. Repointing would have created two sources of truth that drift silently.

> **Distribution is a correctness property, not only a security one.** Two live
> defects came from copy-paste: Preview's `REACT_APP_SUPABASE_ANON_KEY` carried
> leading/trailing whitespace and a return character (flagged by Vercel since
> Jun 11, unnoticed until 2026-08-09), and the Clerk key never propagated to any
> machine at all. Values moved by a tool don't acquire invisible characters or
> miss a rollout.

**Agent credentials are a separate system.** Humans use the Bitwarden Password
Manager (interactive unlock); agents use **Secrets Manager** — one machine
account per seat, a project-scoped token, injected via `bws run` into a
subprocess and never written to disk. Handing an agent the master password
would hand it the whole vault with no scoping and no granular revocation.
See `docs/ARCHITECTURE.md` → "Secrets & Credentials".

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
- [ ] `.env.local` in place **from the Bitwarden vault** (points at dev DB
      `zxwtxjjmssykhqrghouf` — NOT prod; Vercel is not a source)
- [ ] `.env.local` has **three** variables — Supabase URL, Supabase anon key,
      **`REACT_APP_CLERK_PUBLISHABLE_KEY`**
- [ ] `npm install` clean
- [ ] `npm start` → localhost:3000 loads, **sign-in modal renders**, sign-in
      works — confirm by running the app, not by reading the file
- [ ] Claude Code installed and authenticated
- [ ] `git pull origin dev` confirms you're current

---

*Velayo, Inc. — the boat is the office. Any machine, same setup, in under an hour.*
