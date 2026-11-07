/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the hidden file input and the photo <img>'s classes are the rules under test. */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShelfPhotoStrip } from "./ShelfPhotoStrip";

// Shelf photos in Browse (SPEC_ask_slice2 C3b.2, A23).
const ITEMS = [
  { id: "c-apples", name: "Apples", glyph: "🍎", photoUrl: "https://x/thumb.webp", hasPhoto: true },
  { id: "c-bread", name: "Bread", glyph: "🍞", photoUrl: null, hasPhoto: false },
];
const file = new File(["x"], "bread.jpg", { type: "image/jpeg" });

function setup(onPick = jest.fn(async () => ({ ok: true }))) {
  const view = render(<ShelfPhotoStrip items={ITEMS} onPick={onPick} />);
  const input = view.container.querySelector('input[type="file"]');
  input.click = jest.fn();   // jsdom has no chooser; the tap must still open it
  return { onPick, input, container: view.container };
}

test("each slot names its item and whether it has a photo; the photo is replay-blocked", () => {
  const { container } = setup();
  expect(screen.getByRole("button", { name: "Change the photo of Apples" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add a photo of Bread" })).toBeInTheDocument();
  const img = container.querySelector("img");
  expect(img).toHaveClass("op-replay-block", "op-photo");
  expect(img).toHaveAttribute("draggable", "false");
  expect(screen.getByText(/Photograph the item, not a person\./)).toBeInTheDocument();
});

test("a tap opens the chooser; the chosen file goes to the tapped item", async () => {
  const { onPick, input } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Add a photo of Bread" }));
  expect(input.click).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(onPick).toHaveBeenCalledWith("c-bread", file));
});

test("a photo that can't be read, or doesn't save, says so; the next tap clears it", async () => {
  const onPick = jest.fn().mockResolvedValueOnce({ ok: false, reason: "decode" }).mockResolvedValueOnce({ ok: false, reason: "upload" });
  const { input } = setup(onPick);
  fireEvent.click(screen.getByRole("button", { name: "Add a photo of Bread" }));
  fireEvent.change(input, { target: { files: [file] } });
  expect(await screen.findByText("Couldn't read that photo. Try another.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Change the photo of Apples" }));
  expect(screen.getByText(/Photograph the item/)).toBeInTheDocument();
  fireEvent.change(input, { target: { files: [file] } });
  expect(await screen.findByText("That photo didn't save. Try again.")).toBeInTheDocument();
  expect(onPick).toHaveBeenLastCalledWith("c-apples", file);
});

test("an empty slot shows its ＋ only — never an aisle glyph (C3b.1)", () => {
  const { container } = render(<ShelfPhotoStrip items={[{ id: "b", name: "Bananas", glyph: null, photoUrl: null, hasPhoto: false }]} onPick={jest.fn()} />);
  const art = container.querySelector(".shelf-photo-art");
  expect(art.textContent).toBe("＋");
  expect(art.querySelector("img")).toBeNull();
});
