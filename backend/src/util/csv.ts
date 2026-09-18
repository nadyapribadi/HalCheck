// Minimal RFC 4180 CSV parser (quoted fields, embedded commas/newlines, ""
// as an escaped quote) -- not a general library, just enough for a
// hand-filled ingredient upload sheet. No new dependency for what this is:
// a handful of columns, never binary XLSX (Node has no native support for
// that anyway, and nothing in docs/17/docs/11 requires it).
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export interface ParsedIngredientRow {
  name?: string;
  source?: string;
  halalRiskFlag?: boolean;
  overrideReason?: string;
}

// Expected header: name,source,halalRiskFlag,overrideReason -- case
// insensitive, order independent. halalRiskFlag/overrideReason columns are
// optional (matching the plain single-submission route's own optionality).
export function parseIngredientCSV(text: string): ParsedIngredientRow[] {
  const rows = parseCSV(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("name");
  const sourceIdx = header.indexOf("source");
  const riskIdx = header.indexOf("halalriskflag");
  const reasonIdx = header.indexOf("overridereason");

  return rows.slice(1).map((cells) => ({
    name: nameIdx >= 0 ? cells[nameIdx]?.trim() || undefined : undefined,
    source: sourceIdx >= 0 ? cells[sourceIdx]?.trim() || undefined : undefined,
    halalRiskFlag:
      riskIdx >= 0 && cells[riskIdx]?.trim() ? /^(true|yes|1)$/i.test(cells[riskIdx].trim()) : undefined,
    overrideReason: reasonIdx >= 0 ? cells[reasonIdx]?.trim() || undefined : undefined,
  }));
}
