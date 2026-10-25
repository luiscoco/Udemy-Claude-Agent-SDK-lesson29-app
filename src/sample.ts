import { runAgent, validateConfig } from "./agent.js";
const config = validateConfig({ mode: process.argv[2] || "default" });
await runAgent(
  config,
  (e) => console.log(JSON.stringify(e)),
  new AbortController(),
  config.mode === "plan-to-edit"
    ? async () => process.argv.includes("--approve-plan")
    : undefined,
);
