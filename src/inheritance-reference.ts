import type { Options } from "@anthropic-ai/claude-agent-sdk";
// Teaching reference only. The application never launches this agent.
export const inheritanceExample: Pick<Options, "permissionMode" | "agents"> = {
  permissionMode: "plan",
  agents: {
    reviewer: {
      description: "Read-only classroom reviewer",
      prompt: "Review the lesson and report observations.",
      tools: ["Read"],
      permissionMode: "acceptEdits",
    },
  },
};
// Current docs: a plan-mode parent keeps this child in plan mode.
// A child definition cannot enable bypassPermissions.
