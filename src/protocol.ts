export type Mode =
  | "default"
  | "dontAsk"
  | "acceptEdits"
  | "plan"
  | "auto"
  | "bypass"
  | "plan-to-edit"
  | "bypass-deny"
  | "omitted";
export type Outcome = "execute" | "block" | "mixed" | "observe";
export interface RunConfig {
  mode: Mode;
  prediction?: Outcome;
}
export interface Trace {
  phase: "hook" | "callback" | "post";
  tool: string;
  decision: string;
  turn: number;
}
export interface Evidence {
  mode: Mode;
  prediction?: string;
  predictedCorrect?: boolean;
  expectedStage: string;
  expectedOutcome: string;
  observedOutcome: string;
  fileCreated: boolean;
  fileContents: string | null;
  fixtureUnchanged: boolean;
  trace: Trace[];
  completed: string[];
  callbackCalls: number;
  warningCodes: string[];
  nativeErrors: number;
  requestedMode: string;
  reportedModes: string[];
  resultStatuses: string[];
  sessionIds: string[];
  switchAcknowledged: boolean;
  reviewApproved: boolean;
  beforeSwitchFileCreated?: boolean;
  reviewSource: string;
  availabilityNote?: string;
}
export type LabEvent =
  | { type: "options"; config: RunConfig; options: unknown }
  | { type: "configuration"; files: { name: string; contents: string }[] }
  | {
      type: "initialized";
      model: string;
      sessionId: string;
      tools: string[];
      permissionMode: string;
    }
  | { type: "trace"; entry: Trace }
  | { type: "review-required"; id: string; plan: string }
  | { type: "review-resolved"; approved: boolean }
  | { type: "mode-change"; from: string; to: string; acknowledged: boolean }
  | { type: "message"; sdkType: string; summary: string }
  | { type: "tool"; name: string; args: unknown }
  | { type: "native-result"; name: string; isError: boolean; content: unknown }
  | { type: "warning"; code: string; explanation: string }
  | { type: "answer"; text: string }
  | { type: "result"; status: string; text: string; costUsd: number }
  | ({ type: "evidence" } & Evidence)
  | { type: "error" | "notice"; text: string };
