# Claude Agent SDK · Lesson 29 · Permission modes

Five linked student pages, large text, actual SDK experiments and coloured code in all thirteen UML steps.

## What you will learn

- Compare the six explicit modes: Run default, dontAsk, acceptEdits, plan, auto and bypassPermissions against a fixed Read/Write task in a disposable directory. Compare the requested option with the actual mode reported by the SDK.
- Count callbacks and verify files: Default can send the unapproved Write to the denying callback. dontAsk rejects unresolved approval without a callback. acceptEdits can approve the eligible local write. Native results, PostToolUse events and host file checks establish the outcome.
- Review before a live mode switch: The plan-to-edit experiment pauses after the first real result. Review that result, approve or reject it, then observe the awaited setPermissionMode acknowledgement. Only an approved switch releases a second message on the same Query.
- Keep earlier rules and hooks in view: Bypass requires the explicit TypeScript opt-in and still respects earlier deny/ask rules and hooks. The bounded deny experiment scopes an Edit rule to the exact classroom output. This app exposes only Read and Write and never launches shell commands.
- Observe auto and omitted defaults honestly: Auto is model- and deployment-dependent. Its action result is not evidence that a classifier reviewed that particular Write. The omitted experiment records the actual starting mode. Current docs say newer SDK/headless runs default to default, which differs from the supplied slide and some type comments.
- Understand subagent inheritance: Current docs keep a parent plan mode restrictive even when a child requests acceptEdits; only default/dontAsk parents can apply eligible definition overrides. A child cannot enable bypass. This is a source-linked reference topic here; the app launches no subagents.

## Configure and run

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson29-app.git
cd .\Udemy-Claude-Agent-SDK-lesson29-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations use `cd .\agent-sdk\lesson29-permission-modes`. Open http://127.0.0.1:3129 and keep the terminal running. Node.js 24+, API credit and model access are required. Windows may require Git Bash.

## Create your .env file

Preserve an existing file. Enter your own model key, then restart. Existing shell values take precedence.

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3129
# Windows if needed: CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe

```

No GitHub token or Managed Agents IDs are required. Secrets, dependencies and teaching media stay outside Git.

## Run the experiments

### Compare explicit modes

Run the first six experiments and compare actual mode reports, Write attempts, callback counts and file contents. Auto is an observational case and does not expose a classifier trace.

```powershell
npm run sample:env -- default
npm run sample:env -- dontAsk
npm run sample:env -- acceptEdits
npm run sample:env -- plan
npm run sample:env -- auto
npm run sample:env -- bypass
```

### Review and switch on one Query

In the web app choose Plan → review → acceptEdits, run it, review the actual first result and click Approve or Reject. Approval invokes setPermissionMode on the existing query before a second message is released. For an explicitly pre-approved CLI demonstration use the flag below.

```powershell
npm run sample:env -- plan-to-edit --approve-plan
```

### Check deny and omitted behavior

Run the scoped deny under bypass, then omit permissionMode and inspect the actual reported starting mode. Do not assume an older slide’s default applies to this installed runtime.

```powershell
npm run sample:env -- bypass-deny
npm run sample:env -- omitted
npm test
```

## How the app was built

### 1. Validate the experiment and prediction

The browser selects fixed classroom experiments. It cannot supply arbitrary permission modes, paths, commands or mode-change controls.

Source: `src/modes.ts`, selected lines 88–94. Surrounding code omitted.

```typescript
export function validateConfig(value: unknown): RunConfig {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !MODES.includes((value as RunConfig).mode)
  )
```

### 2. Create the disposable workspace

A verified temporary directory contains a read-only lesson fixture and an absent output. The host checks the fixture and output before bounded cleanup.

Source: `src/workspace.ts`, selected lines 13–19. Surrounding code omitted.

```typescript
const root = resolve(parent, randomUUID()),
    cwd = join(root, "project"),
    home = join(root, "home"),
    sdkHome = join(root, "sdk");
  const r = relative(parent, root);
  if (!r || r.startsWith("..") || isAbsolute(r))
    throw new Error("Invalid classroom workspace.");
```

### 3. Choose an explicit or omitted mode

The omitted branch does not send permissionMode. Other branches pass an explicit value and supply the required TypeScript opt-in for bypass.

Source: `src/agent.ts`, selected lines 73–77. Surrounding code omitted.

```typescript
...(s.permissionMode ? { permissionMode: s.permissionMode } : {}),
    ...(s.permissionMode === "plan"
      ? { planModeInstructions: planWorkflow }
      : {}),
    allowDangerouslySkipPermissions: s.permissionMode === "bypassPermissions",
```

### 4. Pass bounded operations to SDK permissions

The guard checks the exact fixture read and fixed output content, then passes valid requests without approving them. Mode and rule behavior remains observable.

Source: `src/agent.ts`, selected lines 104–111. Surrounding code omitted.

```typescript
const pass = hostAllows(
                workspace.cwd,
                input.tool_name,
                input.tool_input as Record<string, unknown>,
              );
              record({
                phase: "hook",
                tool: input.tool_name,
```

### 5. Count the actual callback decisions

The host denies unresolved calls. Compare callback counts with real native feedback, successful completion and file contents instead of assuming every mode prompts.

Source: `src/agent.ts`, selected lines 148–154. Surrounding code omitted.

```typescript
canUseTool: async (name) => {
      record({ phase: "callback", tool: name, decision: "deny", turn });
      return {
        behavior: "deny",
        message:
          "Classroom policy: no approval at this stage. Accept the denial and do not retry. The host can switch mode after a separate plan review.",
      };
```

### 6. Keep the streaming input alive

The first user message is followed by a gate. Only the reviewed switching experiment can release a second task on the same query.

Source: `src/agent.ts`, selected lines 210–217. Surrounding code omitted.

```typescript
async function* input(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: "user",
      message: {
        role: "user",
        content:
          PROMPTS[c.mode] +
          `\nRead: ${join(workspace.cwd, "lesson.txt")}\nWrite: ${join(workspace.cwd, "result.txt")}`,
```

### 7. Start the actual SDK query

One running Query handles the fixed task. The switching experiment reuses this object rather than starting a second session.

Source: `src/agent.ts`, selected lines 234–236. Surrounding code omitted.

```typescript
const run = query({ prompt: input(), options });
  const names = new Map<string, string>();
  try {
```

### 8. Preserve the reported permission mode

Record actual initialization and mode-status reports separately from configured values. An observed Write does not establish a hidden classifier invocation.

Source: `src/agent.ts`, selected lines 248–254. Surrounding code omitted.

```typescript
reportedModes.push(message.permissionMode);
          emit({
            type: "initialized",
            model: message.model,
            sessionId: message.session_id,
            tools: message.tools,
            permissionMode: message.permissionMode,
```

### 9. Verify the pre-review file state

Before asking for review, check the actual output state. The browser receives the real first-turn result rather than a fabricated plan.

Source: `src/agent.ts`, selected lines 308–313. Surrounding code omitted.

```typescript
beforeSwitchFileCreated = (await workspace.inspect()).fileCreated;
            reviewApproved = await (review
              ? review(text, controller.signal)
              : requestReview(text, emit, controller.signal));
            emit({ type: "review-resolved", approved: reviewApproved });
            if (!reviewApproved) {
```

### 10. Resolve a single-use review decision

The review ID resolves one pending decision and is removed after use. Cancellation clears pending state. No mode change is requested on rejection.

Source: `src/review.ts`, selected lines 19–25. Surrounding code omitted.

```typescript
pending.set(id, (approved) => {
      pending.delete(id);
      signal.removeEventListener("abort", abort);
      resolve(approved);
    });
    signal.addEventListener("abort", abort, { once: true });
    emit({ type: "review-required", id, plan });
```

### 11. Await the actual mode-change control

After approval, await acceptEdits on the same Query, record the acknowledgement and only then release the second user message.

Source: `src/agent.ts`, selected lines 317–324. Surrounding code omitted.

```typescript
await run.setPermissionMode("acceptEdits");
            switchAcknowledged = true;
            turn = 2;
            emit({
              type: "mode-change",
              from: "plan",
              to: "acceptEdits",
              acknowledged: true,
```

### 12. Verify output independently

Host checks compare the actual output with the expected classroom content and confirm that the fixture remains unchanged. Model text alone is not execution proof.

Source: `src/workspace.ts`, selected lines 32–36. Surrounding code omitted.

```typescript
fileCreated: fileContents !== null,
        fileContents,
        fixtureUnchanged:
          (await readFile(join(cwd, "lesson.txt"), "utf-8")) === LESSON,
      };
```

### 13. Show the live review and acknowledgement

Render the actual mode-change event and explain that the second turn follows acknowledgement. Keep the real first-turn plan visible for review.

Source: `src/client.ts`, selected lines 45–49. Surrounding code omitted.

```typescript
if (e.type === "mode-change") {
    json("mode-change", e);
    $("review-status").textContent =
      "SDK acknowledged acceptEdits. The second turn can now perform the fixed write.";
  }
```

## Reference topics and limits

- Version-aware omitted defaults: The supplied slide and some SDK type comments mention auto as a possible omitted default. Current official docs say Claude Code 2.1.302+ headless/Agent SDK runs start in default unless settings or an explicit option change it. This app disables ordinary setting sources and records the actual initialization mode.
- Plan is not auto-approval: Current docs route file writes to the callback in plan mode even if a Write allow entry matches. The model may also choose not to attempt a write while planning; lack of an attempt is different from an SDK rejection. The live evidence must be read accordingly.
- Auto mode observations: Availability depends on model, provider and policy. Some actions may resolve before classifier review. The app reports actual mode, action result and any startup diagnostic without fabricating classifier reasoning or promising the same outcome on every runtime.
- Working-directory scope: acceptEdits automatically approves eligible operations in cwd or additionalDirectories. Protected paths and critical-path removals have additional rules. This app uses fixed local Read/Write operations and does not test destructive shell commands or protected system paths.
- Bypass still has earlier checks: TypeScript requires allowDangerouslySkipPermissions true. Scoped denies and hooks still apply. The live scoped Edit deny protects only the disposable result file. SDK modes are permission policy, not an operating-system sandbox.
- Subagent inheritance reference: Current docs inherit plan, acceptEdits, auto and bypass from the parent. A plan-mode parent remains restrictive even if a child definition requests acceptEdits; this differs from the supplied slide. Eligible overrides apply under default/dontAsk parents, and a child definition cannot enable bypass. This application launches no subagents.
- Real review versus test automation: The web experiment waits for an actual Approve or Reject button decision. CLI automation requires --approve-plan; the live test harness uses an explicit review callback and labels it accordingly. Only approved review can request the mode switch.
- Evidence and API cost: Nine actual SDK queries include a second model turn for the switching case. Each query has a $0.40 SDK budget threshold, not a prepaid cap. Credentials, dependencies, raw recordings and all teaching media stay outside Git.
- Planning artifacts versus source edits: The SDK planning workflow may request a Markdown plan artifact under its private configuration directory. This classroom guard blocks every extra file, including those artifacts, and logs the hook rejection separately. Do not confuse that guard rejection with the callback denying result.txt in plan mode. The actual final plan text remains reviewable.

## References

- [Official SDK permissions documentation](https://code.claude.com/docs/en/agent-sdk/permissions)
- [TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript)

Regenerate student pages with `python scripts/build-pages.py`. Run `npm test` for offline boundaries, review lifecycle, workspace and startup checks.
