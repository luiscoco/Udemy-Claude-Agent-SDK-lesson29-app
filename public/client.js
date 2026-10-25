import { renderMarkdown } from "./markdown.js";
const $ = (id) => document.getElementById(id);
const button = $("run"), rows = [];
const traces = [], native = [], warnings = [];
let reviewId = "";
async function answerReview(approved) {
    const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reviewId, approved }),
    });
    if (!response.ok) {
        $("review-status").textContent = "This review is no longer pending.";
        return;
    }
    $("approve-plan").disabled = true;
    $("reject-plan").disabled = true;
}
$("approve-plan").onclick = () => void answerReview(true);
$("reject-plan").onclick = () => void answerReview(false);
const json = (id, value) => {
    $(id).textContent = JSON.stringify(value, null, 2);
    window.Prism?.highlightElement($(id));
};
function receive(e) {
    rows.push(e);
    if (e.type === "review-required") {
        reviewId = e.id;
        $("review-panel").hidden = false;
        renderMarkdown($("review-plan"), e.plan);
        $("review-status").textContent =
            "Review the actual first-turn result before enabling edits.";
        $("approve-plan").disabled = false;
        $("reject-plan").disabled = false;
    }
    if (e.type === "review-resolved") {
        $("review-status").textContent = e.approved
            ? "Review approved; waiting for the SDK mode-change acknowledgement."
            : "Plan rejected. No mode change requested.";
    }
    if (e.type === "mode-change") {
        json("mode-change", e);
        $("review-status").textContent =
            "SDK acknowledged acceptEdits. The second turn can now perform the fixed write.";
    }
    if (e.type === "configuration") {
        const select = $("configuration-file");
        select.replaceChildren();
        e.files.forEach((file, i) => {
            const option = document.createElement("option");
            option.value = String(i);
            option.textContent = file.name;
            select.append(option);
        });
        const show = () => {
            $("configuration-content").textContent =
                e.files[Number(select.value)].contents;
            window.Prism?.highlightElement($("configuration-content"));
        };
        select.onchange = show;
        show();
    }
    if (e.type === "options")
        json("options", e.options);
    if (e.type === "initialized") {
        $("session").textContent = e.sessionId;
        json("discovery", e);
    }
    if (e.type === "trace") {
        traces.push(e.entry);
        json("trace", traces);
    }
    if (e.type === "native-result") {
        native.push(e);
        json("native", native);
    }
    if (e.type === "warning") {
        warnings.push(e);
        json("warnings", warnings);
    }
    if (e.type === "answer")
        renderMarkdown($("answer"), e.text);
    if (e.type === "result") {
        $("status").textContent = e.status;
        $("cost").textContent = "$" + e.costUsd.toFixed(5);
        renderMarkdown($("answer"), e.text);
    }
    if (e.type === "evidence") {
        json("evidence", e);
        const feedback = e.predictedCorrect === undefined
            ? "No prediction provided."
            : e.predictedCorrect
                ? "Your prediction matched."
                : "Compare the recorded evidence with the reference order.";
        $("verdict").textContent =
            `Observed: ${e.observedOutcome}. Prediction: ${e.prediction || "not provided"}. ` +
                feedback;
        const tr = document.createElement("tr");
        for (const value of [
            e.mode,
            e.expectedStage,
            e.prediction || "—",
            e.observedOutcome,
            e.callbackCalls,
            e.completed.join(", ") || "None",
            e.fixtureUnchanged ? "unchanged" : "CHANGED",
        ]) {
            const td = document.createElement("td");
            td.textContent = String(value);
            tr.append(td);
        }
        $("history").append(tr);
    }
    if (e.type === "notice" || e.type === "error")
        $("notice").textContent = e.text;
    if (e.type === "error")
        $("status").textContent = "Could not finish";
    if ([
        "message",
        "tool",
        "native-result",
        "trace",
        "result",
        "warning",
        "error",
    ].includes(e.type)) {
        const li = document.createElement("li");
        li.textContent = JSON.stringify(e);
        $("events").append(li);
    }
}
button.onclick = async () => {
    button.disabled = true;
    traces.length = 0;
    native.length = 0;
    warnings.length = 0;
    reviewId = "";
    $("review-panel").hidden = true;
    json("mode-change", {});
    $("answer").replaceChildren();
    $("events").replaceChildren();
    $("notice").textContent = "";
    $("status").textContent = "Running…";
    $("verdict").textContent = "Waiting for actual evidence…";
    for (const id of [
        "options",
        "discovery",
        "native",
        "trace",
        "evidence",
        "warnings",
    ])
        json(id, {});
    $("session").textContent = "—";
    $("cost").textContent = "—";
    const config = {
        mode: $("mode").value,
        prediction: $("prediction").value,
    };
    try {
        const response = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config),
        });
        if (!response.ok)
            throw new Error(await response.text());
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let pending = "";
        while (true) {
            const { done, value } = await reader.read();
            pending += decoder.decode(value, { stream: !done });
            const lines = pending.split("\n");
            pending = lines.pop();
            for (const line of lines)
                if (line.trim())
                    receive(JSON.parse(line));
            if (done)
                break;
        }
        if ($("status").textContent === "Running…")
            $("status").textContent = "No final result";
    }
    catch (error) {
        $("status").textContent = "Could not finish";
        $("notice").textContent =
            error instanceof Error ? error.message : "Request failed";
    }
    finally {
        button.disabled = false;
    }
};
$("download").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lesson29-observations.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
};
fetch("/api/config")
    .then((r) => r.json())
    .then((c) => {
    $("configuration").textContent =
        `Model: ${c.model} · SDK ${c.typescriptVersion} · ${c.ready ? "API key configured" : "Configure .env first"}`;
    button.disabled = !c.ready;
    $("mode").value = c.defaults.mode;
})
    .catch(() => {
    $("configuration").textContent =
        "Could not reach the server. See How to run.";
});
