import type { ArtifactFile, Onboarding } from "./types";

export type ModelUpload = { abort: () => void };
export async function uploadModelFiles({ operation, files, manifest, owner, onProgress, onUpload, isActive, completionAction = "complete-upload" }: {
  operation: Onboarding; files: File[]; manifest: ArtifactFile[]; owner: string;
  getToken?: () => Promise<string | null>; onProgress: (bytes: number) => void;
  onUpload: (upload: ModelUpload | null) => void; isActive: () => boolean;
  completionAction?: "complete-upload" | "start";
}) {
  const controller = new AbortController();
  onUpload({ abort: () => controller.abort() });
  const active = () => { if (!isActive() || controller.signal.aborted) throw new Error("Upload paused. Select the same folder to resume."); };
  async function request(url: string, body: unknown) {
    active();
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload request failed.");
    return data;
  }
  try {
    const context = await request(`/api/onboarding/${operation.id}`, { action: "upload" });
    let done = 0;
    for (let index = 0; index < files.length; index++) {
      active();
      const file = files[index], path = manifest[index].path;
      if (!context.files.some((entry: ArtifactFile) => entry.path === path && entry.size === file.size && (entry.modified == null || entry.modified === file.lastModified))) throw new Error("Select the original model folder to resume.");
      if (context.completed.includes(path)) { done += file.size; onProgress(done); continue; }
      const url = `/api/onboarding/${operation.id}/files`;
      const storageKey = `modelledger:r2:${owner}:${operation.id}:${path}:${file.size}:${file.lastModified}`;
      let token: string | null = null;
      try { token = localStorage.getItem(storageKey); } catch { /* Resume storage may be unavailable. */ }
      let resumed: { parts: { number: number; size: number }[]; partSize: number } | undefined;
      if (token) {
        try { resumed = await request(url, { action: "resume", path, token }); }
        catch (error) { active(); if (!(error instanceof Error) || !/expired|changed|Invalid upload session|does not exist|specified upload|NoSuchUpload/i.test(error.message)) throw error; token = null; }
      }
      if (!token) {
        const started = await request(url, { action: "begin", path });
        token = started.token;
        resumed = { parts: [], partSize: started.partSize };
        try { localStorage.setItem(storageKey, token!); } catch { /* Upload works without persistent resume. */ }
      }
      const partSize = resumed!.partSize;
      const finished = new Set(resumed!.parts.map(part => part.number));
      let sent = resumed!.parts.reduce((sum, part) => sum + part.size, 0);
      onProgress(done + sent);
      for (let part = 1; part <= Math.ceil(file.size / partSize); part++) {
        if (finished.has(part)) continue;
        const blob = file.slice((part - 1) * partSize, Math.min(part * partSize, file.size));
        for (let attempt = 0; ; attempt++) {
          active();
          try {
            const signed = await request(url, { action: "part", path, token, part });
            await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              const abort = () => xhr.abort();
              controller.signal.addEventListener("abort", abort, { once: true });
              const cleanup = () => controller.signal.removeEventListener("abort", abort);
              xhr.open("PUT", signed.url);
              xhr.timeout = 600000;
              xhr.upload.onprogress = event => onProgress(done + sent + event.loaded);
              xhr.onload = () => { cleanup(); if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error("R2 rejected this upload part. Check bucket permissions and CORS.")); };
              xhr.onerror = xhr.ontimeout = () => { cleanup(); reject(new Error("R2 upload could not connect. Check connection and bucket CORS.")); };
              xhr.onabort = () => { cleanup(); reject(new Error("Upload paused. Select the same folder to resume.")); };
              xhr.send(blob);
            });
            break;
          } catch (error) {
            active();
            if (attempt >= 3) throw error;
            await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
          }
        }
        sent += blob.size; onProgress(done + sent);
      }
      await request(url, { action: "finish", path, token });
      try { localStorage.removeItem(storageKey); } catch { /* Optional bookkeeping. */ }
      done += file.size; onProgress(done);
    }
    await request(`/api/onboarding/${operation.id}`, { action: completionAction });
  } finally { onUpload(null); }
}
