import type { MiguriImportHandoff } from "./miguri-auto-import";

const PAGE_SOURCE = "46log-miguri-page";
const EXTENSION_SOURCE = "46log-miguri-extension";

export type MiguriExtensionAutoState = {
  enabled: boolean;
  intervalMinutes: number;
  status:
    | "idle"
    | "disabled"
    | "syncing"
    | "success"
    | "needs-login"
    | "error";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string;
  needsLogin: string;
  imported: number;
};

export type MiguriExtensionEvent =
  | { type: "PONG"; version: string }
  | { type: "STARTED"; syncSource: "fortunemusic" | "fortunemeets" }
  | { type: "PROGRESS"; title: string; detail: string }
  | { type: "RESULT"; payload: MiguriImportHandoff }
  | { type: "AUTO_STATE"; state: MiguriExtensionAutoState }
  | { type: "ERROR"; message: string };

function post(type: string, payload: Record<string, unknown> = {}) {
  window.postMessage(
    { source: PAGE_SOURCE, type, ...payload },
    window.location.origin,
  );
}

export function pingMiguriExtension() {
  post("PING");
}

export function startMiguriExtensionSync(
  syncSource: "fortunemusic" | "fortunemeets",
) {
  post("START", { syncSource });
}

export function setMiguriExtensionAutoSync(enabled: boolean) {
  post("SET_AUTO_ENABLED", { enabled });
}

export function runMiguriExtensionAutoSync() {
  post("RUN_AUTO");
}

export function subscribeMiguriExtension(
  listener: (event: MiguriExtensionEvent) => void,
): () => void {
  const handleMessage = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin)
      return;
    const message = event.data as Record<string, unknown> | null;
    if (
      !message ||
      message.source !== EXTENSION_SOURCE ||
      typeof message.type !== "string"
    )
      return;

    if (message.type === "PONG" && typeof message.version === "string") {
      listener({ type: "PONG", version: message.version });
    } else if (
      message.type === "STARTED" &&
      (message.syncSource === "fortunemusic" ||
        message.syncSource === "fortunemeets")
    ) {
      listener({ type: "STARTED", syncSource: message.syncSource });
    } else if (message.type === "PROGRESS") {
      listener({
        type: "PROGRESS",
        title: typeof message.title === "string" ? message.title : "同步中",
        detail: typeof message.detail === "string" ? message.detail : "",
      });
    } else if (
      message.type === "RESULT" &&
      message.payload &&
      typeof message.payload === "object"
    ) {
      listener({
        type: "RESULT",
        payload: message.payload as MiguriImportHandoff,
      });
    } else if (
      message.type === "AUTO_STATE" &&
      message.autoState &&
      typeof message.autoState === "object"
    ) {
      listener({
        type: "AUTO_STATE",
        state: message.autoState as MiguriExtensionAutoState,
      });
    } else if (message.type === "ERROR") {
      listener({
        type: "ERROR",
        message:
          typeof message.message === "string"
            ? message.message
            : "扩展连接失败",
      });
    }
  };

  window.addEventListener("message", handleMessage);
  pingMiguriExtension();
  return () => window.removeEventListener("message", handleMessage);
}
