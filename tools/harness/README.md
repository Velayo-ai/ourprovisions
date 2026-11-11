# tools/harness — signed-in headless walks on dev

Drives the real app on `dev.ourprovisions.velayo.ai` as the dev test account, in the local
Chrome, headless, so Claude Code can walk signed-in screens and take screenshots. Dev only.
(Ruled 2026-11-11: a Velayo OS tool; the test account never joins another household and
never touches prod.)

## Credentials

`.env.test.local` in the repo root (git-ignored by `.gitignore`, line 19 — prove it with
`git check-ignore -v .env.test.local` before writing it):

```
OP_TEST_EMAIL=dan+clerk_test@velayo.ai
OP_TEST_PASSWORD=<the password>
```

No `REACT_APP_` prefix on purpose: CRA bundles every `REACT_APP_*` variable into the public JS.
The scripts read the file themselves and type the values into Clerk's fields only; nothing here
prints, logs, screenshots or commits them. Dev Device Trust is on: the first sign-in from a new
browser profile shows "Check your email"; on dev, `+clerk_test` accepts code `424242`.

## Run

```
cd tools/harness
npm install                      # puppeteer-core only; no browser download
node chrome.js start             # the local Chrome, headless, remote debugging on :9333
node signin.js                   # sign in (+ name the first place if the welcome sheet shows)
node ask-run.js                  # Browse → + New shelf (Ask Test) → Hand it over → out/ask-run.png
node step.js <name> <action> …   # ad-hoc: open | click <sel> | clickText <text> | type <sel> <ENV:VAR|text> | press | wait | eval | shot
node chrome.js stop              # ALWAYS, when the walk is done
```

Screenshots and text dumps land in `out/` (git-ignored); the browser profile in `profile/`
(git-ignored — it holds the signed-in session, which is why `stop` is not optional).

## What it took to make this work (2026-11-11)

- **The user-agent is a browser-level flag.** Clerk will not load under the "HeadlessChrome"
  user-agent (`window.Clerk` stays undefined and the Sign In button stays disabled). A
  per-session `page.setUserAgent(...)` works only while that CDP session lives; the moment the
  script disconnects, the override is gone, Clerk tears down and the page reloads. `chrome.js`
  passes `--user-agent=<iPhone UA>` on the command line, so every session sees it.
- **One Node process per flow.** Connecting per step (a new CDP session each time) loses the
  modal and emulation state between steps. `signin.js` and `ask-run.js` each run their whole
  flow in one process; `step.js` is for poking at a page, not for driving a flow.
- **Clerk's modal fields are not inside `#clerk-components`.** That div exists and stays empty;
  `input[name=identifier]`, `input[name=password]` and the device-trust `input[name=code]`
  are found document-wide. The modal needs a beat after `Clerk.loaded`: tap Sign In, wait up
  to 5 s for the identifier field, tap again if it isn't there.
- **The app's own selectors used here:** `.home-welcome-btn.ghost` (Sign In), the welcome
  sheet's input (`placeholder="Home, The Smiths, Lake house…"`) and its Continue button,
  `button.cat-pill` containing "New shelf" / "Ask {Label}", `#new-shelf-label`, the
  `[role=radio]` targets, `[data-testid=new-shelf-catalog] button` rows, "Save shelf",
  `.ask-handover`, `.ask-run`.
- **Kill the harness Chrome by its profile path**, never `taskkill chrome.exe` — that would
  take the person's own browser with it. `chrome.js stop` does the right thing.
- Deploys reload the page: the app picks up a new build while it is open, so don't run a walk
  across a push.
