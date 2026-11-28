import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { projectRoot } from "./load-ts.mjs";

/**
 * Regression guard for the empty operations dropdowns.
 *
 * Headless UI publishes the measured width of the trigger under a variable
 * named for the part that owns it: a `Listbox` sets `--button-width` from its
 * button, while a `Combobox` without a `ComboboxButton` sets only
 * `--input-width`. When both panels shared one width utility, the combobox
 * panel resolved to `0px` and opened invisibly, so the merchant and courier
 * pickers looked empty even though their data had loaded.
 */

const SOURCE = readFileSync(
  path.join(projectRoot, "src/components/ui/select-menus.tsx"),
  "utf8",
);

test("the listbox panel sizes against the button width", () => {
  assert.match(SOURCE, /LISTBOX_PANEL[\s\S]*--button-width/);
});

test("the combobox panel sizes against the input width", () => {
  assert.match(SOURCE, /COMBO_PANEL[\s\S]*--input-width/);
});

test("the combobox panel never sizes against the button width", () => {
  const combo = SOURCE.match(/const COMBO_PANEL =[^;]+;/);
  assert.ok(combo, "COMBO_PANEL declaration is missing");
  assert.equal(combo[0].includes("--button-width"), false);
});

test("the combobox panel keeps a minimum width when measurement is zero", () => {
  const combo = SOURCE.match(/const COMBO_PANEL =[^;]+;/);
  assert.ok(combo);
  assert.match(combo[0], /min-w-/);
});

test("ListboxOptions uses the listbox panel and ComboboxOptions the combo panel", () => {
  assert.match(SOURCE, /<ListboxOptions[^>]*className=\{LISTBOX_PANEL\}/);
  assert.match(SOURCE, /<ComboboxOptions[^>]*className=\{COMBO_PANEL\}/);
});
