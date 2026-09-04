const REQUEST_EVENT = "ecc-update-checkpoint-request";
const RESULT_EVENT = "ecc-update-checkpoint-result";

type CheckpointResult = { requestId: string; ok: boolean; message?: string };
let editActive = false;
export function setEditActive(active:boolean){editActive=active;window.dispatchEvent(new CustomEvent("ecc-edit-state"));}
export function isEditActive(){return editActive;}

export function onUpdateCheckpointRequest(handler: () => Promise<void>) {
  const listener = (event: Event) => {
    const requestId = (event as CustomEvent<{ requestId?: string }>).detail?.requestId;
    if (!requestId) return;
    void handler()
      .then(() => window.dispatchEvent(new CustomEvent<CheckpointResult>(RESULT_EVENT, { detail: { requestId, ok: true } })))
      .catch((error) => window.dispatchEvent(new CustomEvent<CheckpointResult>(RESULT_EVENT, { detail: { requestId, ok: false, message: error instanceof Error ? error.message : String(error) } })));
  };
  window.addEventListener(REQUEST_EVENT, listener);
  return () => window.removeEventListener(REQUEST_EVENT, listener);
}

/**
 * Ask the currently open form, if any, to finish its IndexedDB checkpoint before
 * a service-worker reload. If there is no open form, the request resolves quickly.
 */
export function checkpointBeforeReload(timeoutMs = 5000): Promise<void> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let settled = false;
    let responseSeen = false;
    const cleanup = () => {
      window.removeEventListener(RESULT_EVENT, onResult);
      clearTimeout(noListenerTimer);
      clearTimeout(hardTimer);
    };
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<CheckpointResult>).detail;
      if (!detail || detail.requestId !== requestId) return;
      responseSeen = true;
      if (settled) return;
      settled = true;
      cleanup();
      detail.ok ? resolve() : reject(new Error(detail.message || "The open form could not be checkpointed safely."));
    };
    window.addEventListener(RESULT_EVENT, onResult);
    window.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail: { requestId } }));

    // If no form is open in this tab, there is nothing to checkpoint.
    const noListenerTimer = window.setTimeout(() => {
      if (settled || responseSeen) return;
      settled = true;
      cleanup();
      resolve();
    }, 250);
    const hardTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Timed out while waiting for the current form to finish its local checkpoint."));
    }, timeoutMs);
  });
}
