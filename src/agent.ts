import {
  query,
  type Options,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { join } from "node:path";
import { validateConfig, MODES, SCENARIOS, hostAllows } from "./modes.js";
import { prepareWorkspace } from "./workspace.js";
import { requestReview } from "./review.js";
import type { Mode, RunConfig, LabEvent, Trace, Evidence } from "./protocol.js";
export { MODES, validateConfig };
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
export const DEFAULT_CONFIG: RunConfig = {
  mode: "default",
  prediction: "mixed",
};
const task =
  "Read lesson.txt once. Then attempt Write once to result.txt with exactly MODE-29 followed by one newline. This is a permission test: make the requested Write attempt even in plan mode. If denied, accept the rejection without another path, tool or retry. Briefly report actual results.";
export const PROMPTS = Object.fromEntries(
  MODES.map((mode) => [
    mode,
    mode === "plan-to-edit" || mode === "plan"
      ? "Read lesson.txt once and propose a one-step plan to create result.txt with MODE-29 followed by one newline after host review. Do not attempt that output write in this first turn. Return the plan directly as final text, not as a file. The host owns review and the later mode switch."
      : task,
  ]),
) as Record<Mode, string>;
export function redact(text: string) {
  for (const value of [
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_AUTH_TOKEN,
  ].filter(Boolean) as string[])
    text = text.split(value).join("[REDACTED]");
  return text.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[REDACTED]").slice(0, 22000);
}
export async function runAgent(
  config: RunConfig,
  emit: (e: LabEvent) => void,
  controller = new AbortController(),
  review?: (plan: string, signal: AbortSignal) => Promise<boolean>,
) {
  const c = validateConfig(config),
    s = SCENARIOS[c.mode],
    workspace = await prepareWorkspace();
  const trace: Trace[] = [],
    completed: string[] = [],
    warningCodes: string[] = [],
    reportedModes: string[] = [],
    resultStatuses: string[] = [],
    sessionIds: string[] = [];
  let nativeErrors = 0,
    turn = 1,
    switchAcknowledged = false,
    reviewApproved = false,
    beforeSwitchFileCreated: boolean | undefined,
    availabilityNote: string | undefined;
  const record = (entry: Trace) => {
    trace.push(entry);
    emit({ type: "trace", entry });
  };
  const planWorkflow = [
    "This classroom requests a read-only plan before any output write.",
    "Read the fixture and return a one-step plan as final text without writing the output.",
    "Create no plan file or other artifact. The host owns review and switching.",
    "Do not request ExitPlanMode.",
  ].join(" ");
  const options: Options = {
    model: MODEL,
    cwd: workspace.cwd,
    tools: ["Read", "Write"],
    mcpServers: {},
    allowedTools: s.allowed,
    disallowedTools: s.denied,
    ...(s.permissionMode ? { permissionMode: s.permissionMode } : {}),
    ...(s.permissionMode === "plan"
      ? { planModeInstructions: planWorkflow }
      : {}),
    allowDangerouslySkipPermissions: s.permissionMode === "bypassPermissions",
    settingSources: [],
    skills: [],
    plugins: [],
    strictMcpConfig: true,
    persistSession: false,
    effort: "low",
    thinking: { type: "disabled" },
    maxTurns: 8,
    maxBudgetUsd: 0.4,
    abortController: controller,
    env: {
      ...process.env,
      HOME: workspace.home,
      USERPROFILE: workspace.home,
      CLAUDE_CONFIG_DIR: workspace.sdkHome,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      ENABLE_CLAUDEAI_MCP_SERVERS: "false",
    },
    systemPrompt:
      "This is a bounded classroom permission experiment. Perform the requested available Read and Write attempts using real tools. Do not simulate calls, anticipate a rejection instead of attempting, retry denials, use alternate paths or alter modes yourself. Only the host can change mode after review. Keep the final answer brief.",
    hooks: {
      PreToolUse: [
        {
          hooks: [
            async (input) => {
              if (input.hook_event_name !== "PreToolUse") return {};
              const pass = hostAllows(
                workspace.cwd,
                input.tool_name,
                input.tool_input as Record<string, unknown>,
              );
              record({
                phase: "hook",
                tool: input.tool_name,
                decision: pass ? "pass" : "deny",
                turn,
              });
              return pass
                ? {}
                : {
                    hookSpecificOutput: {
                      hookEventName: "PreToolUse",
                      permissionDecision: "deny",
                      permissionDecisionReason:
                        "Outside the fixed classroom Read/Write task.",
                    },
                  };
            },
          ],
        },
      ],
      PostToolUse: [
        {
          hooks: [
            async (input) => {
              if (input.hook_event_name === "PostToolUse") {
                completed.push(input.tool_name);
                record({
                  phase: "post",
                  tool: input.tool_name,
                  decision: "completed",
                  turn,
                });
              }
              return {};
            },
          ],
        },
      ],
    },
    canUseTool: async (name) => {
      record({ phase: "callback", tool: name, decision: "deny", turn });
      return {
        behavior: "deny",
        message:
          "Classroom policy: no approval at this stage. Accept the denial and do not retry. The host can switch mode after a separate plan review.",
      };
    },
  };
  emit({
    type: "configuration",
    files: [
      {
        name: "Actual mode configuration",
        contents: JSON.stringify(
          {
            permissionMode: s.permissionMode ?? "(omitted)",
            allowedTools: s.allowed,
            disallowedTools: s.denied,
            allowDangerouslySkipPermissions:
              options.allowDangerouslySkipPermissions,
            callback: "deny unresolved requests",
            subagents: "reference only; none launched",
          },
          null,
          2,
        ),
      },
    ],
  });
  emit({
    type: "options",
    config: c,
    options: {
      model: MODEL,
      tools: options.tools,
      permissionMode: s.permissionMode ?? "(omitted)",
      allowedTools: s.allowed,
      disallowedTools: s.denied,
      allowDangerouslySkipPermissions: options.allowDangerouslySkipPermissions,
      referenceStage: s.stage,
      expectedOutcome: s.outcome,
      cwd: "fresh disposable directory",
    },
  });
  const warningListener = (warning: Error) => {
    const code = (warning as NodeJS.ErrnoException).code;
    if (code === "CLAUDE_SDK_CAN_USE_TOOL_SHADOWED") {
      warningCodes.push(code);
      emit({
        type: "warning",
        code,
        explanation:
          "The SDK detected configuration that can resolve a request before the callback. Inspect actual events.",
      });
    }
  };
  process.on("warning", warningListener);
  let release!: () => void;
  const gate = new Promise<void>((ok) => {
    release = ok;
  });
  async function* input(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: "user",
      message: {
        role: "user",
        content:
          PROMPTS[c.mode] +
          `\nRead: ${join(workspace.cwd, "lesson.txt")}\nWrite: ${join(workspace.cwd, "result.txt")}`,
      },
      parent_tool_use_id: null,
      session_id: "",
    };
    await gate;
    if (c.mode === "plan-to-edit" && reviewApproved)
      yield {
        type: "user",
        message: {
          role: "user",
          content: `The host reviewed the plan and acknowledged acceptEdits. Now Write exactly once to ${join(workspace.cwd, "result.txt")} with MODE-29 followed by one newline. Do not read again. Report the actual result.`,
        },
        parent_tool_use_id: null,
        session_id: "",
      };
  }
  const run = query({ prompt: input(), options });
  const names = new Map<string, string>();
  try {
    try {
      for await (const message of run) {
        emit({
          type: "message",
          sdkType: message.type,
          summary:
            "subtype" in message
              ? String(message.subtype)
              : "Actual SDK message",
        });
        if (message.type === "system" && message.subtype === "init") {
          reportedModes.push(message.permissionMode);
          emit({
            type: "initialized",
            model: message.model,
            sessionId: message.session_id,
            tools: message.tools,
            permissionMode: message.permissionMode,
          });
        }
        if (
          message.type === "system" &&
          message.subtype === "status" &&
          message.permissionMode
        )
          reportedModes.push(message.permissionMode);
        if (message.type === "assistant")
          for (const block of message.message.content) {
            if (block.type === "text")
              emit({ type: "answer", text: redact(block.text) });
            if (block.type === "tool_use") {
              names.set(block.id, block.name);
              emit({ type: "tool", name: block.name, args: block.input });
            }
          }
        if (message.type === "user" && Array.isArray(message.message.content))
          for (const block of message.message.content)
            if (block.type === "tool_result") {
              if (block.is_error) nativeErrors++;
              emit({
                type: "native-result",
                name: names.get(block.tool_use_id) || block.tool_use_id,
                isError: Boolean(block.is_error),
                content: JSON.parse(redact(JSON.stringify(block.content))),
              });
            }
        if (message.type === "result") {
          const status =
            message.subtype === "success"
              ? message.is_error
                ? "error"
                : "success"
              : message.subtype;
          const text = redact(
            message.subtype === "success"
              ? message.result
              : message.errors.join("\n"),
          );
          resultStatuses.push(status);
          sessionIds.push(message.session_id);
          emit({
            type: "result",
            status,
            text,
            costUsd: message.total_cost_usd,
          });
          if (
            c.mode === "plan-to-edit" &&
            resultStatuses.length === 1 &&
            status === "success"
          ) {
            beforeSwitchFileCreated = (await workspace.inspect()).fileCreated;
            reviewApproved = await (review
              ? review(text, controller.signal)
              : requestReview(text, emit, controller.signal));
            emit({ type: "review-resolved", approved: reviewApproved });
            if (!reviewApproved) {
              release();
              break;
            }
            await run.setPermissionMode("acceptEdits");
            switchAcknowledged = true;
            turn = 2;
            emit({
              type: "mode-change",
              from: "plan",
              to: "acceptEdits",
              acknowledged: true,
            });
            release();
            continue;
          }
          break;
        }
      }
    } catch (error) {
      if (c.mode !== "auto" || controller.signal.aborted) throw error;
      availabilityNote = redact(
        error instanceof Error ? error.message : String(error),
      );
      emit({
        type: "notice",
        text: "Auto mode did not complete in this runtime: " + availabilityNote,
      });
    }
    const files = await workspace.inspect();
    const observedOutcome = completed.length
      ? nativeErrors
        ? "mixed"
        : "execute"
      : "block";
    const evidence: Evidence = {
      mode: c.mode,
      prediction: c.prediction,
      predictedCorrect: c.prediction
        ? c.prediction === "observe" || c.prediction === observedOutcome
        : undefined,
      expectedStage: s.stage,
      expectedOutcome: s.outcome,
      observedOutcome,
      ...files,
      trace,
      completed,
      callbackCalls: trace.filter((e) => e.phase === "callback").length,
      warningCodes,
      nativeErrors,
      requestedMode: s.permissionMode ?? "(omitted)",
      reportedModes,
      resultStatuses,
      sessionIds,
      switchAcknowledged,
      reviewApproved,
      beforeSwitchFileCreated,
      reviewSource:
        c.mode !== "plan-to-edit"
          ? "not requested"
          : review
            ? "explicit host review callback"
            : "web review button",
      ...(availabilityNote ? { availabilityNote } : {}),
    };
    emit({ type: "evidence", ...evidence });
  } finally {
    release();
    run.close();
    process.off("warning", warningListener);
    await workspace.cleanup();
  }
}
