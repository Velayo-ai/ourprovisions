import { CategorySelect } from "./CategorySelect";

// Edit item → Category (2026-11-05). A custom item gets the picker (CategorySelect: option values
// are indexes, never names, per the replay rule), preselected to its current category; no empty
// option, a category is required. A standard item shows its category as read-only text.
export function EditItemCategoryField({ isCustom, options, value, onChange, currentLabel }) {
  return (
    <div className="modal-field">
      <label className="modal-label">Category</label>
      {isCustom ? (
        <CategorySelect categories={options} value={value} onChange={onChange} />
      ) : (
        <>
          <div className="edit-item-category-ro" style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.95rem", color: "#2C1A0E", padding: "6px 0" }}>
            {currentLabel}
          </div>
          <p style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.75rem", color: "#8a7a60", margin: "4px 0 0 0", fontStyle: "italic" }}>
            Standard items stay in their aisle for now.
          </p>
        </>
      )}
    </div>
  );
}

export default EditItemCategoryField;
