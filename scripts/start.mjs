// npm start: serve the page locally. ES modules don't load from file://, so a server is needed.
import { fileURLToPath } from "node:url";
import { serve } from "./server.mjs";

const root = fileURLToPath(new URL("../site", import.meta.url));
const server = await serve(root, Number(process.env.PORT) || 4321);
console.log(`LLM Output Quality Scoring Guide on http://127.0.0.1:${server.address().port}/`);
