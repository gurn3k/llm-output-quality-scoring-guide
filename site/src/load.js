// Loading outputs: CSV (comma or semicolon), tab-separated text pasted from a spreadsheet, and JSONL.
// No row disappears silently: every row either loads or is refused with its row number and a reason.
// Row numbers are as a spreadsheet shows them (header = row 1); for JSONL, the line number.

export const MAX_ROWS = 500;

// Reads the text into a table. Returns { format, columns, records: [{row, cells}], refused, error }.
export function parseTable(text, filename = "") {
  const clean = String(text ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (clean.trim() === "") return { format: null, columns: [], records: [], refused: [], error: "The file is empty." };
  const first = clean.split("\n").find((l) => l.trim() !== "") ?? "";
  if (/\.jsonl$/i.test(filename) || first.trim().startsWith("{")) return parseJsonl(clean);
  const delimiter = first.includes("\t") ? "\t" : countOutsideQuotes(first, ";") > countOutsideQuotes(first, ",") ? ";" : ",";
  return parseDelimited(clean, delimiter);
}

function countOutsideQuotes(line, ch) {
  let n = 0, quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (c === ch && !quoted) n++;
  }
  return n;
}

function parseDelimited(text, delimiter) {
  const records = [];
  const refused = [];
  let cells = [], cell = "", quoted = false, row = 1, rowStart = 1, i = 0;
  const endRecord = () => {
    cells.push(cell);
    if (!(cells.length === 1 && cells[0].trim() === "")) records.push({ row: rowStart, cells });
    cells = []; cell = ""; row++; rowStart = row;
  };
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell.trim() === "") { cell = ""; quoted = true; }
    else if (c === delimiter) { cells.push(cell); cell = ""; }
    else if (c === "\n") endRecord();
    else cell += c;
  }
  if (quoted) {
    refused.push({ row: rowStart, reason: `A quote opened in row ${rowStart} never closes, so row ${rowStart} and everything after it weren't loaded.` });
  } else if (cell !== "" || cells.length) endRecord();

  const format = delimiter === "\t" ? "tsv" : delimiter === ";" ? "csv;" : "csv";
  if (!records.length) return { format, columns: [], records: [], refused, error: "The file is empty." };
  const [header, ...rest] = records;
  const columns = header.cells.map((c) => c.trim());
  if (!rest.length && !refused.length) return { format, columns, records: [], refused, error: "There are no rows under the header." };
  return { format, columns, records: rest, refused, error: null };
}

function parseJsonl(text) {
  const records = [];
  const refused = [];
  text.split("\n").forEach((line, i) => {
    const row = i + 1;
    if (line.trim() === "") return;
    let value;
    try { value = JSON.parse(line); } catch { refused.push({ row, reason: `Line ${row} is not valid JSON.` }); return; }
    if (value === null || typeof value !== "object" || Array.isArray(value)) { refused.push({ row, reason: `Line ${row} is not an object with input and output.` }); return; }
    records.push({ row, cells: ["input", "output", "reference"].map((k) => (typeof value[k] === "string" ? value[k] : value[k] == null ? "" : String(value[k]))) });
  });
  if (!records.length && !refused.length) return { format: "jsonl", columns: [], records: [], refused, error: "The file is empty." };
  return { format: "jsonl", columns: ["input", "output", "reference"], records, refused, error: null };
}

// Which columns hold the message, the reply and the optional reference. Null if the user must choose.
export function guessColumns(columns) {
  const find = (...names) => columns.findIndex((c) => names.includes(c.toLowerCase()));
  const input = find("input", "message", "prompt");
  const output = find("output", "reply", "response");
  if (input === -1 || output === -1 || input === output) return null;
  const reference = find("reference", "ref");
  return { input: columns[input], output: columns[output], reference: reference === -1 ? null : columns[reference] };
}

// Turns the table into items. choice = { input, output, reference? } column names.
export function toItems(table, choice) {
  const refused = [...table.refused];
  const items = [];
  if (table.error) return { items, refused, error: table.error };
  const col = (name) => (name ? table.columns.indexOf(name) : -1);
  const [ci, co, cr] = [col(choice.input), col(choice.output), col(choice.reference)];
  if (ci === -1 || co === -1) return { items, refused, error: "Choose which columns hold the message and the reply." };
  for (const { row, cells } of table.records) {
    if (table.format !== "jsonl" && cells.length > table.columns.length) {
      refused.push({ row, reason: `Row ${row} has ${cells.length} columns; the header has ${table.columns.length}.` });
      continue;
    }
    const get = (i) => (i === -1 ? "" : (cells[i] ?? "").trim());
    const item = { id: `row-${row}`, row, input: get(ci), output: get(co), reference: get(cr) };
    if (item.output === "") { refused.push({ row, reason: `Row ${row}: the reply is empty, so there's nothing to judge.` }); continue; }
    if (item.input === "") { refused.push({ row, reason: `Row ${row}: the message is empty.` }); continue; }
    if (items.length === MAX_ROWS) {
      const last = table.records[table.records.length - 1].row;
      refused.push({ row, reason: `Only the first ${MAX_ROWS} rows are loaded; rows ${row} to ${last} were not.` });
      break;
    }
    items.push(item);
  }
  refused.sort((a, b) => a.row - b.row);
  return { items, refused, error: null };
}

// One call for the common case. needsColumnChoice is true when the headers don't say which is which.
export function load(text, filename = "") {
  const table = parseTable(text, filename);
  if (table.error) return { items: [], refused: table.refused, error: table.error, columns: table.columns, needsColumnChoice: false, table };
  const choice = guessColumns(table.columns);
  if (!choice) return { items: [], refused: table.refused, error: null, columns: table.columns, needsColumnChoice: true, table };
  return { ...toItems(table, choice), columns: table.columns, needsColumnChoice: false, choice, table };
}

// "N loaded, M refused" always adds up to every row the file had.
export function summary({ items, refused }) {
  return `${items.length} loaded, ${refused.length} refused`;
}
