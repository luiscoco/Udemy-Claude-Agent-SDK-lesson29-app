import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { resolve } from "node:path";
import type { Mode, Outcome, RunConfig } from "./protocol.js";
export const MODES: Mode[] = [
  "default",
  "dontAsk",
  "acceptEdits",
  "plan",
  "auto",
  "bypass",
  "plan-to-edit",
  "bypass-deny",
  "omitted",
];
export const SCENARIOS: Record<
  Mode,
  {
    permissionMode?: PermissionMode;
    allowed: string[];
    denied: string[];
    outcome: Outcome;
    stage: string;
  }
> = {
  default: {
    permissionMode: "default",
    allowed: ["Read"],
    denied: [],
    outcome: "mixed",
    stage: "Unapproved Write reaches denying callback",
  },
  dontAsk: {
    permissionMode: "dontAsk",
    allowed: ["Read"],
    denied: [],
    outcome: "mixed",
    stage: "Unresolved Write denied without callback",
  },
  acceptEdits: {
    permissionMode: "acceptEdits",
    allowed: ["Read"],
    denied: [],
    outcome: "execute",
    stage: "Eligible Write approved by mode",
  },
  plan: {
    permissionMode: "plan",
    allowed: ["Read", "Write"],
    denied: [],
    outcome: "observe",
    stage: "Observe planning with no output edit",
  },
  auto: {
    permissionMode: "auto",
    allowed: ["Read"],
    denied: [],
    outcome: "observe",
    stage: "Observe reported auto mode and actual action outcome",
  },
  bypass: {
    permissionMode: "bypassPermissions",
    allowed: ["Read"],
    denied: [],
    outcome: "execute",
    stage: "Unlisted Write approved in bounded bypass experiment",
  },
  "plan-to-edit": {
    permissionMode: "plan",
    allowed: ["Read"],
    denied: [],
    outcome: "observe",
    stage: "Review before real setPermissionMode on one Query",
  },
  "bypass-deny": {
    permissionMode: "bypassPermissions",
    allowed: ["Read", "Write"],
    denied: ["Edit(./result.txt)"],
    outcome: "mixed",
    stage: "Scoped deny still applies in bypass",
  },
  omitted: {
    allowed: ["Read"],
    denied: [],
    outcome: "observe",
    stage: "Observe SDK-reported starting mode when omitted",
  },
};
export function validateConfig(value: unknown): RunConfig {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !MODES.includes((value as RunConfig).mode)
  )
    throw new Error("Choose a listed mode experiment.");
  const c = value as RunConfig;
  if (
    c.prediction !== undefined &&
    !["execute", "block", "mixed", "observe"].includes(c.prediction)
  )
    throw new Error("Choose a listed prediction.");
  return {
    mode: c.mode,
    ...(c.prediction ? { prediction: c.prediction } : {}),
  };
}
export function hostAllows(
  cwd: string,
  name: string,
  input: Record<string, unknown>,
) {
  const file =
    typeof input.file_path === "string" ? resolve(cwd, input.file_path) : "";
  return name === "Read"
    ? file === resolve(cwd, "lesson.txt")
    : name === "Write" &&
        file === resolve(cwd, "result.txt") &&
        input.content === "MODE-29\n";
}
// Reference only: no subagents are launched by this application.
export const INHERITANCE_REFERENCE = {
  parentModesInherited: ["plan", "acceptEdits", "auto", "bypassPermissions"],
  overrideEligibleParents: ["default", "dontAsk"],
  childBypassOverrideApplied: false,
  note: "Current docs keep a plan-mode parent restrictive, even if a child requests acceptEdits. This differs from the supplied slide.",
};
