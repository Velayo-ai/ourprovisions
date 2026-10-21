// Verification 5, Dan's ruling (b), 2026-10-21: a stored JPEG carries no EXIF, no XMP, no
// IPTC and no GPS. stripJpegMetadata drops every APP1 and APP13 segment before upload, keeps
// APP0 (JFIF), the tables, the frame and the image data, and leaves any non-JPEG alone.
// Run: CI=true npx react-scripts test --watchAll=false src/lib/image
import { stripJpegSegments, stripJpegMetadata } from "./image";

// An 8×6 gradient, encoded by Chrome's canvas JPEG encoder (APP0 JFIF + APP2 ICC, no APP1 /
// APP13) — synthetic, no household content. It decodes: Chrome made it.
const CLEAN_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAGAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAZEAEAAgMAAAAAAAAAAAAAAAAAAgQFIjH/xAAVAQEBAAAAAAAAAAAAAAAAAAAEBf/EABoRAAAHAAAAAAAAAAAAAAAAAAABAgMEEyH/2gAMAwEAAhEDEQA/AJ5m5LboCjCaRUWAEtxVh6P/2Q==";
const CLEAN = Uint8Array.from(Buffer.from(CLEAN_B64, "base64"));

const seg = (marker, payload) => {
  const len = payload.length + 2;
  return Uint8Array.from([0xff, marker, len >> 8, len & 0xff, ...payload]);
};
const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));
const u16le = (n) => [n & 0xff, n >> 8];
const u32le = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const entry = (tag, type, count, value4) => [...u16le(tag), ...u16le(type), ...u32le(count), ...value4];

// APP1 "Exif\0\0" + a little-endian TIFF: IFD0 = { Make "Phone", Orientation 6, GPSInfo → GPS IFD },
// GPS IFD = { GPSLatitudeRef "N", GPSLatitude 43°10'12.34" }. A real GPS block, not a string.
function exifWithGps() {
  const make = ascii("Phone\0");
  const ifd0At = 8, ifd0Len = 2 + 3 * 12 + 4, makeAt = ifd0At + ifd0Len, gpsAt = makeAt + make.length;
  const gpsLen = 2 + 2 * 12 + 4, latAt = gpsAt + gpsLen;
  const tiff = [
    ...ascii("II"), 42, 0, ...u32le(ifd0At),
    ...u16le(3),
    ...entry(0x010f, 2, make.length, u32le(makeAt)),
    ...entry(0x0112, 3, 1, [6, 0, 0, 0]),
    ...entry(0x8825, 4, 1, u32le(gpsAt)),
    ...u32le(0),
    ...make,
    ...u16le(2),
    ...entry(0x0001, 2, 2, [...ascii("N"), 0, 0, 0]),
    ...entry(0x0002, 5, 3, u32le(latAt)),
    ...u32le(0),
    ...u32le(43), ...u32le(1), ...u32le(10), ...u32le(1), ...u32le(1234), ...u32le(100),
  ];
  return seg(0xe1, [...ascii("Exif"), 0, 0, ...tiff]);
}
const xmp = () => seg(0xe1, ascii("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPSLatitude>43,10.2N</exif:GPSLatitude></x:xmpmeta>"));
const iptc = () => seg(0xed, [...ascii("Photoshop 3.0\0"), ...ascii("8BIM"), 0x04, 0x04, 0, 0, 0, 0, 0, 0]);

// Insert segments right after APP0 (JFIF), where phones put them.
function withSegments(...extra) {
  const app0Len = (CLEAN[4] << 8) | CLEAN[5];
  const cut = 2 + 2 + app0Len;
  const parts = [CLEAN.subarray(0, cut), ...extra, CLEAN.subarray(cut)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  parts.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
}

// The header's markers, in order, up to SOS.
function markers(bytes) {
  const out = [];
  let i = 2;
  while (bytes[i] === 0xff && bytes[i + 1] !== 0xda) {
    out.push(bytes[i + 1]);
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return out;
}
const has = (bytes, s) => Buffer.from(bytes).includes(Buffer.from(s, "latin1"));

describe("stripJpegSegments (ruling (b))", () => {
  test("the fixture is what it claims: a clean JPEG (APP0, APP2, no APP1/APP13)", () => {
    expect(CLEAN[0]).toBe(0xff); expect(CLEAN[1]).toBe(0xd8);
    expect(markers(CLEAN)).toEqual([0xe0, 0xe2, 0xdb, 0xdb, 0xc0, 0xc4, 0xc4, 0xc4, 0xc4]);
  });

  test("a JPEG with a GPS-bearing APP1, an XMP APP1 and an APP13 comes out with none of them — and still decodes", () => {
    const dirty = withSegments(exifWithGps(), xmp(), iptc());
    expect(markers(dirty).filter((m) => m === 0xe1 || m === 0xed)).toHaveLength(3);
    expect(has(dirty, "Exif")).toBe(true);
    expect(has(dirty, "Photoshop")).toBe(true);
    const out = stripJpegSegments(dirty);
    expect(markers(out)).not.toContain(0xe1);
    expect(markers(out)).not.toContain(0xed);
    ["Exif", "GPS", "http://ns.adobe.com", "Photoshop", "8BIM", "Phone"].forEach((s) => expect(has(out, s)).toBe(false));
    expect(markers(out)[0]).toBe(0xe0);   // APP0 (JFIF) kept
    // Decodes: removing exactly what was inserted restores Chrome's own encode, byte for byte.
    expect(Buffer.from(out).equals(Buffer.from(CLEAN))).toBe(true);
    expect(out[out.length - 2]).toBe(0xff); expect(out[out.length - 1]).toBe(0xd9);   // EOI intact
  });

  test("a JPEG without APP1 / APP13 comes out byte-identical (the same array)", () => {
    expect(stripJpegSegments(CLEAN)).toBe(CLEAN);
  });

  test("fill bytes before a marker are walked, not mistaken for data", () => {
    const filled = withSegments(Uint8Array.from([0xff]), iptc());   // an extra 0xFF before APP13
    const out = stripJpegSegments(filled);
    expect(markers(out)).not.toContain(0xed);
  });

  test("a file it cannot walk is refused, never uploaded unchecked", () => {
    expect(() => stripJpegSegments(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toThrow();
    const truncated = withSegments(exifWithGps()).subarray(0, 30);
    expect(() => stripJpegSegments(truncated)).toThrow();
  });
});

describe("stripJpegMetadata (Blob)", () => {
  test("a JPEG blob with metadata → a new JPEG blob without it", async () => {
    const out = await stripJpegMetadata(new Blob([withSegments(exifWithGps(), iptc())], { type: "image/jpeg" }));
    expect(out.type).toBe("image/jpeg");
    expect(out.size).toBe(CLEAN.length);
  });

  test("a clean JPEG blob is returned as the same blob", async () => {
    const b = new Blob([CLEAN], { type: "image/jpeg" });
    expect(await stripJpegMetadata(b)).toBe(b);
  });

  test("a WebP passes through untouched (the same blob, never read)", async () => {
    const webp = new Blob([Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])], { type: "image/webp" });
    const spy = jest.fn();   // jsdom's Blob has no arrayBuffer: any read would call this
    Object.defineProperty(webp, "arrayBuffer", { value: spy });
    expect(await stripJpegMetadata(webp)).toBe(webp);
    expect(spy).not.toHaveBeenCalled();
  });
});
