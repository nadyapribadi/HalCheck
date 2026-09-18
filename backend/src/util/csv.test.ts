import { describe, expect, it } from "vitest";
import { parseCSV, parseIngredientCSV } from "./csv.js";

describe("parseCSV", () => {
  it("splits plain comma-separated rows", () => {
    expect(parseCSV("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles a quoted field with an embedded comma", () => {
    expect(parseCSV('name,note\nAqua,"contains, a comma"\n')).toEqual([
      ["name", "note"],
      ["Aqua", "contains, a comma"],
    ]);
  });

  it("handles an escaped quote inside a quoted field", () => {
    expect(parseCSV('name\n"say ""hi"""\n')).toEqual([["name"], ['say "hi"']]);
  });

  it("returns [] for an empty file", () => {
    expect(parseCSV("")).toEqual([]);
  });
});

describe("parseIngredientCSV", () => {
  it("maps header columns regardless of order, tolerating missing optional columns", () => {
    const rows = parseIngredientCSV("source,name\nPT Sumber Alam Nusantara,Aqua\n");
    expect(rows).toEqual([{ name: "Aqua", source: "PT Sumber Alam Nusantara", halalRiskFlag: undefined, overrideReason: undefined }]);
  });

  it("parses halalRiskFlag from yes/true/1 variants", () => {
    const rows = parseIngredientCSV(
      "name,source,halalRiskFlag\nA,S,yes\nB,S,true\nC,S,1\nD,S,no\n",
    );
    expect(rows.map((r) => r.halalRiskFlag)).toEqual([true, true, true, false]);
  });
});
