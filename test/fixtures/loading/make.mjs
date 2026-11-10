// Writes the loading fixtures byte for byte (BOM, CRLF, tabs), so they can't be mangled by an
// editor. Run: node test/fixtures/loading/make.mjs
// expected.json says, for each file, which rows load (as {input, output, reference}) and which are
// refused (row number as a spreadsheet would show it, header = row 1, and a phrase the reason must contain).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const files = {
  "basic.csv": "input,output\nWhere is my order?,It ships in 3-7 business days.\nCan I return it?,Yes within 30 days.\n",
  "quoted.csv": 'input,output\n"Hi, I have two questions","Sure, here are both answers:\n1. Yes\n2. No"\n"She said ""thanks""",ok\n',
  "semicolon.csv": "input;output\nWhere is my order?;It ships soon, usually in 3-7 days.\nRefund?;5-7 business days\n",
  "bom.csv": "﻿input,output\nCafé question,Réponse en français\n",
  "excel-crlf.csv": "input,output\r\nFirst,One\r\nSecond,Two\r\n\r\n",
  "sheets-paste.tsv": "input\toutput\nWhere is my order?\tIt ships in 3-7 days, roughly.\nRefund?\t5-7 business days\n",
  "with-reference.csv": "input,output,reference\nQ1,A1,Ref one\nQ2,A2,\n",
  "column-names.csv": "Customer message,AI reply,Notes\nQ1,A1,n\n",
  "malformed.csv": 'input,output\nGood row,Fine\nEmpty reply,\n,Reply with no message\nToo,many,columns,here\nAnother good,Also fine\n"Never closed,oops\nLost row,lost\n',
  "items.jsonl": '{"input":"Q1","output":"A1"}\n\n{"input":"Q2","output":"A2","reference":"R2"}\n{"input":"Q3"}\nnot json\n{"input":"Q5","output":""}\n["array"]\n{"input":"Q7","output":"A7"}\n',
  "too-many.csv": "input,output\n" + Array.from({ length: 501 }, (_, i) => `Q${i + 1},A${i + 1}`).join("\n") + "\n",
  "empty.csv": "",
  "header-only.csv": "input,output\n",
};
for (const [name, body] of Object.entries(files)) writeFileSync(DIR + name, body, "utf8");

const rows = (...pairs) => pairs.map(([input, output, reference = ""]) => ({ input, output, reference }));
const expected = {
  "basic.csv": { loaded: rows(["Where is my order?", "It ships in 3-7 business days."], ["Can I return it?", "Yes within 30 days."]), refused: [] },
  "quoted.csv": { loaded: rows(["Hi, I have two questions", "Sure, here are both answers:\n1. Yes\n2. No"], ['She said "thanks"', "ok"]), refused: [] },
  "semicolon.csv": { loaded: rows(["Where is my order?", "It ships soon, usually in 3-7 days."], ["Refund?", "5-7 business days"]), refused: [] },
  "bom.csv": { loaded: rows(["Café question", "Réponse en français"]), refused: [] },
  "excel-crlf.csv": { loaded: rows(["First", "One"], ["Second", "Two"]), refused: [] },
  "sheets-paste.tsv": { loaded: rows(["Where is my order?", "It ships in 3-7 days, roughly."], ["Refund?", "5-7 business days"]), refused: [] },
  "with-reference.csv": { loaded: rows(["Q1", "A1", "Ref one"], ["Q2", "A2", ""]), refused: [] },
  "column-names.csv": { needsColumnChoice: true, columns: ["Customer message", "AI reply", "Notes"], choose: { input: "Customer message", output: "AI reply" }, loaded: rows(["Q1", "A1"]), refused: [] },
  "malformed.csv": {
    loaded: rows(["Good row", "Fine"], ["Another good", "Also fine"]),
    refused: [
      { row: 3, reason: "reply is empty" },
      { row: 4, reason: "message is empty" },
      { row: 5, reason: "4 columns" },
      { row: 7, reason: "never closes" },
    ],
  },
  "items.jsonl": {
    loaded: rows(["Q1", "A1"], ["Q2", "A2", "R2"], ["Q7", "A7"]),
    refused: [
      { row: 4, reason: "reply is empty" },
      { row: 5, reason: "not valid JSON" },
      { row: 6, reason: "reply is empty" },
      { row: 7, reason: "not an object" },
    ],
  },
  "too-many.csv": { loadedCount: 500, refused: [{ row: 502, reason: "500" }] },
  "empty.csv": { loaded: [], refused: [], error: "empty" },
  "header-only.csv": { loaded: [], refused: [], error: "no rows" },
};
writeFileSync(DIR + "expected.json", JSON.stringify(expected, null, 2) + "\n");
console.log(`wrote ${Object.keys(files).length} fixtures and expected.json`);
