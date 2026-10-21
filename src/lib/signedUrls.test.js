import { createSignedUrlCache, SIGNED_URL_TTL_S, SIGNED_URL_REFRESH_MS } from "./signedUrls";

function fakeDb({ refuse = [] } = {}) {
  const calls = [];
  let n = 0;
  const db = {
    storage: {
      from: (bucket) => ({
        createSignedUrls: async (paths, ttl) => {
          calls.push({ bucket, paths: [...paths], ttl });
          n += 1;
          return { data: paths.map((p) => (refuse.includes(p) ? { path: p, signedUrl: null, error: "Object not found" } : { path: p, signedUrl: `https://x/${p}?token=${n}`, error: null })), error: null };
        },
      }),
    },
  };
  return { db, calls };
}

describe("createSignedUrlCache (R9)", () => {
  test("mints in ONE batch with a 1 h TTL", async () => {
    const { db, calls } = fakeDb();
    const c = createSignedUrlCache({ bucket: "meal-photos" });
    const out = await c.resolve(db, ["a", "b", "a", null]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ bucket: "meal-photos", paths: ["a", "b"], ttl: SIGNED_URL_TTL_S });
    expect(Object.keys(out).sort()).toEqual(["a", "b"]);
  });

  test("reuses the same URL inside the hour — no re-mint, so the browser cache hits", async () => {
    let t = 0;
    const { db, calls } = fakeDb();
    const c = createSignedUrlCache({ bucket: "meal-photos", now: () => t });
    const first = await c.resolve(db, ["a"]);
    t = 50 * 60 * 1000;   // 50 min later: 10 min left, outside the 5 min window
    const again = await c.resolve(db, ["a"]);
    expect(calls).toHaveLength(1);
    expect(again.a).toBe(first.a);
  });

  test("re-mints only within 5 min of expiry, and only the stale paths", async () => {
    let t = 0;
    const { db, calls } = fakeDb();
    const c = createSignedUrlCache({ bucket: "meal-photos", now: () => t });
    await c.resolve(db, ["a"]);
    t = SIGNED_URL_TTL_S * 1000 - SIGNED_URL_REFRESH_MS + 1;
    const out = await c.resolve(db, ["a", "b"]);
    expect(calls).toHaveLength(2);
    expect(calls[1].paths).toEqual(["a", "b"]);
    expect(out.a).toMatch(/token=2$/);
  });

  test("a refused path is absent (the tint shows), the rest resolve", async () => {
    const { db } = fakeDb({ refuse: ["gone"] });
    const c = createSignedUrlCache({ bucket: "meal-photos" });
    const out = await c.resolve(db, ["gone", "ok"]);
    expect(out).toEqual({ ok: "https://x/ok?token=1" });
  });

  test("concurrent callers share one in-flight batch", async () => {
    const { db, calls } = fakeDb();
    const c = createSignedUrlCache({ bucket: "meal-photos" });
    const [x, y] = await Promise.all([c.resolve(db, ["a"]), c.resolve(db, ["a"])]);
    expect(calls).toHaveLength(1);
    expect(x.a).toBe(y.a);
  });

  test("a failing batch is non-fatal and returns nothing", async () => {
    const db = { storage: { from: () => ({ createSignedUrls: async () => ({ data: null, error: { message: "nope" } }) }) } };
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const c = createSignedUrlCache({ bucket: "meal-photos" });
    expect(await c.resolve(db, ["a"])).toEqual({});
    warn.mockRestore();
  });
});
