/* Wraps the browser's File System Access API. Chrome and Edge can write back
   into the same file, so saving behaves like Word: one file, updated in place.
   Safari and Firefox cannot, so those get a download and are told so plainly
   rather than being left to think a save happened.

   Every picker call MUST run directly inside a click handler with no await
   before it, or the browser discards the user gesture and rejects it.

   See docs/superpowers/specs/2026-08-07-syllabus-file-design.md */
const TYPES = [{ description: 'OCU Tracker file', accept: { 'application/json': ['.json'] } }];

export function canWriteInPlace() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

export async function pickSave(suggestedName) {
  try { return await window.showSaveFilePicker({ suggestedName, types: TYPES }); }
  catch (e) { if (e && e.name === 'AbortError') return null; throw e; }
}

export async function pickOpen() {
  try {
    const [handle] = await window.showOpenFilePicker({ types: TYPES, multiple: false });
    const text = await (await handle.getFile()).text();
    return { handle, text };
  } catch (e) { if (e && e.name === 'AbortError') return null; throw e; }
}

/* Browsers drop write permission between sessions. Returns false when declined,
   so the caller can say so instead of failing silently. */
export async function ensureWritable(handle) {
  if (!handle || !handle.queryPermission) return false;
  try {
    if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
    /* Throws when the click that triggered this has already expired — asking for
       write permission needs live user activation. Never let that escape as an
       unhandled rejection, or the button just appears dead. */
    return await handle.requestPermission({ mode: 'readwrite' }) === 'granted';
  } catch (_) { return false; }
}

/* Writes, then reads the file back and checks it is really the size we wrote.
   A write that fails part-way, or is silently dropped, otherwise leaves the app
   reporting success while the file on disk is stale — the worst possible
   outcome for someone relying on that file as their only copy. */
export async function writeTo(handle, text) {
  const w = await handle.createWritable();
  await w.write(text); await w.close();
  if (handle.getFile) {
    const onDisk = await handle.getFile();
    const wrote = new Blob([text]).size;
    if (onDisk.size !== wrote)
      throw new Error(`the file holds ${onDisk.size} bytes but ${wrote} were written`);
  }
  return true;
}

export function downloadInstead(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
