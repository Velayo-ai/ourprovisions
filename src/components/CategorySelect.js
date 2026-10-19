// CategorySelect — a <select> over a household's categories whose <option>
// VALUES carry no names (2026-10-19, SPEC_replay_labels_promotion2 A3).
//
// The session recorder masks text and inputs, and special-cases SELECT, but it
// copies an <option>'s attributes verbatim — so `<option value={cat.rawName}>`
// put every household-authored category name into each replay snapshot. Here
// the value is the option's INDEX in `categories`, mapped back to rawName in
// the change handler; the name is the option's text only (masked). Callers
// keep speaking rawName: `value` in, `onChange(rawName | "")` out, "" = the
// placeholder option, exactly as the old inline selects did.
export function CategorySelect({ categories, value, onChange, placeholder, className = "modal-select", style }) {
  const idx = categories.findIndex((c) => c.rawName === value);
  return (
    <select
      className={className}
      value={idx === -1 ? "" : String(idx)}
      onChange={(e) => {
        const i = e.target.value;
        onChange(i === "" ? "" : categories[Number(i)].rawName);
      }}
      style={style}
    >
      <option value="">{placeholder}</option>
      {categories.map((cat, i) => (
        <option key={cat.rawName} value={String(i)}>{cat.name}</option>
      ))}
    </select>
  );
}

export default CategorySelect;
