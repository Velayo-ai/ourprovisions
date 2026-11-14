// The Ask icon (2026-11-13): one raised hand, the same for every Ask — an invitation to take part,
// never a piece of the name (an initial would be a piece of it outside .op-name, K3). It replaces
// the basket emoji on every Ask pill: no emoji, so the pill's geometry and colour are the same in
// every font and on every platform. Outline on currentColor, so it takes the pill's ink and goes
// white when the pill is pressed. Sized to the pill's fixed glyph box (.cat-em, 17 px wide).
// Path: Lucide "hand" (ISC).
export function AskIcon({ size = 16 }) {
  return (
    <svg className="ask-ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-4 0v1" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}

export default AskIcon;
