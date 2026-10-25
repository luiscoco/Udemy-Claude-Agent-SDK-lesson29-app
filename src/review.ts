import { randomUUID } from "node:crypto";
import type { LabEvent } from "./protocol.js";
const pending = new Map<string, (approved: boolean) => void>();
export function requestReview(
  plan: string,
  emit: (e: LabEvent) => void,
  signal: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Review cancelled"));
      return;
    }
    const id = randomUUID();
    const abort = () => {
      pending.delete(id);
      reject(new Error("Review cancelled"));
    };
    pending.set(id, (approved) => {
      pending.delete(id);
      signal.removeEventListener("abort", abort);
      resolve(approved);
    });
    signal.addEventListener("abort", abort, { once: true });
    emit({ type: "review-required", id, plan });
  });
}
export function resolveReview(id: string, approved: boolean) {
  const answer = pending.get(id);
  if (!answer) return false;
  answer(approved);
  return true;
}
