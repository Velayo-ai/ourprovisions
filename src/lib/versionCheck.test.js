// Run: CI=true npx react-scripts test --watchAll=false src/lib/versionCheck
// SPEC_app_version_check V1–V3: the helpers, the hook (a stubbed manifest), and the wiring in App.
import { render, screen, act, fireEvent } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { runningMainScript, manifestMain, isNewVersion, fetchLatestMain, MANIFEST_URL } from "./versionCheck";
import { useVersionCheck } from "../hooks/useVersionCheck";
import { VersionNotice } from "../components/VersionNotice";

const RUNNING = "/static/js/main.4e6c5a9d.js";
const NEWER = "/static/js/main.0123abcd.js";
function docWith(src) {
  const d = document.implementation.createHTMLDocument("t");
  if (src) { const s = d.createElement("script"); s.setAttribute("src", src); d.head.appendChild(s); }
  return d;
}
const manifest = (main) => ({ ok: true, json: async () => ({ files: { "main.js": main } }) });

describe("helpers", () => {
  test("runningMainScript reads the main.*.js tag's path, and nothing else", () => {
    expect(runningMainScript(docWith(RUNNING))).toBe(RUNNING);
    expect(runningMainScript(docWith("https://ourprovisions.velayo.ai" + RUNNING))).toBe(RUNNING);
    expect(runningMainScript(docWith("/static/js/bundle.js"))).toBeNull();   // npm start
    expect(runningMainScript(docWith(null))).toBeNull();
    expect(runningMainScript(null)).toBeNull();
  });
  test("manifestMain and isNewVersion: unknown is never new", () => {
    expect(manifestMain({ files: { "main.js": NEWER } })).toBe(NEWER);
    expect(manifestMain({})).toBeNull();
    expect(manifestMain(null)).toBeNull();
    expect(isNewVersion(RUNNING, NEWER)).toBe(true);
    expect(isNewVersion(RUNNING, RUNNING)).toBe(false);
    expect(isNewVersion(null, NEWER)).toBe(false);
    expect(isNewVersion(RUNNING, null)).toBe(false);
  });
  test("fetchLatestMain asks with cache: no-store; any failure is null", async () => {
    const f = jest.fn(async () => manifest(NEWER));
    await expect(fetchLatestMain(f)).resolves.toBe(NEWER);
    expect(f).toHaveBeenCalledWith(MANIFEST_URL, { cache: "no-store" });
    await expect(fetchLatestMain(async () => ({ ok: false }))).resolves.toBeNull();
    await expect(fetchLatestMain(async () => { throw new TypeError("offline"); })).resolves.toBeNull();
    await expect(fetchLatestMain(async () => ({ ok: true, json: async () => { throw new SyntaxError("bad"); } }))).resolves.toBeNull();
  });
});

describe("useVersionCheck", () => {
  function Probe({ fetchImpl, doc }) {
    const v = useVersionCheck({ fetchImpl, doc });
    return v.show ? <VersionNotice onReload={v.reload} onDismiss={v.dismiss} /> : <span>quiet</span>;
  }
  const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
  const foreground = () => act(async () => { document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve(); await Promise.resolve(); });

  test("a different deployed bundle shows the notice; ✕ hides it; the next foreground checks and shows it again", async () => {
    const fetchImpl = jest.fn(async () => manifest(NEWER));
    render(<Probe fetchImpl={fetchImpl} doc={docWith(RUNNING)} />);
    await flush();
    expect(screen.getByText("A new version is ready.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByText("quiet")).toBeInTheDocument();
    await foreground();
    expect(screen.getByText("A new version is ready.")).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("the same bundle: nothing shows", async () => {
    render(<Probe fetchImpl={jest.fn(async () => manifest(RUNNING))} doc={docWith(RUNNING)} />);
    await flush();
    expect(screen.getByText("quiet")).toBeInTheDocument();
  });

  test("offline: no fetch, nothing shows; a failed fetch: nothing shows, nothing throws", async () => {
    const online = jest.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const fetchImpl = jest.fn(async () => manifest(NEWER));
    const { unmount } = render(<Probe fetchImpl={fetchImpl} doc={docWith(RUNNING)} />);
    await flush();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(screen.getByText("quiet")).toBeInTheDocument();
    unmount();
    online.mockRestore();
    render(<Probe fetchImpl={jest.fn(async () => { throw new TypeError("offline"); })} doc={docWith(RUNNING)} />);
    await flush();
    expect(screen.getByText("quiet")).toBeInTheDocument();
  });

  test("a newer bundle already known hides while offline (Reload would strand the app) and returns online", async () => {
    render(<Probe fetchImpl={jest.fn(async () => manifest(NEWER))} doc={docWith(RUNNING)} />);
    await flush();
    expect(screen.getByText("A new version is ready.")).toBeInTheDocument();
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    expect(screen.getByText("quiet")).toBeInTheDocument();
    await act(async () => { window.dispatchEvent(new Event("online")); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText("A new version is ready.")).toBeInTheDocument();
  });

  test("a failed fetch keeps what was known: a newer bundle stays offered", async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(manifest(NEWER)).mockRejectedValue(new TypeError("blip"));
    render(<Probe fetchImpl={fetchImpl} doc={docWith(RUNNING)} />);
    await flush();
    await foreground();
    expect(screen.getByText("A new version is ready.")).toBeInTheDocument();
  });

  test("a rollback to the running bundle clears it", async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(manifest(NEWER)).mockResolvedValue(manifest(RUNNING));
    render(<Probe fetchImpl={fetchImpl} doc={docWith(RUNNING)} />);
    await flush();
    expect(screen.getByText("A new version is ready.")).toBeInTheDocument();
    await foreground();
    expect(screen.getByText("quiet")).toBeInTheDocument();
  });

  test("no main.*.js tag (npm start): never checks", async () => {
    const fetchImpl = jest.fn(async () => manifest(NEWER));
    render(<Probe fetchImpl={fetchImpl} doc={docWith("/static/js/bundle.js")} />);
    await flush();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("the wiring (source)", () => {
  const SRC = path.join(__dirname, "..");
  const APP = fs.readFileSync(path.join(SRC, "App.js"), "utf8");
  const TAG = fs.readFileSync(path.join(SRC, "components", "BuildTag.js"), "utf8");
  test("the notice waits for an Ask run to end and for any toast to go", () => {
    expect(APP).toContain("{versionCheck.show && !runAskId && !toastMessage && (");
    expect(APP.match(/<VersionNotice /g)).toHaveLength(1);
  });
  test("the build tag is behind the build-time production check, so it leaves the prod bundle", () => {
    expect(TAG).toContain('export const BUILD_TAG_ON = process.env.REACT_APP_DEPLOY_ENV !== "production";');
    expect(APP).toContain("{BUILD_TAG_ON && <BuildTag />}");
    expect(APP.match(/<BuildTag /g)).toHaveLength(1);
  });
});
