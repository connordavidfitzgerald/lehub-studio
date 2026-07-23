/**
 * Persistent storage for uploaded images. The poster state can only hold an
 * `HTMLImageElement`, which has no JSON form, so the session stores a *reference*
 * to the image instead: a URL for the bundled placeholders, or an IndexedDB key
 * for anything the user uploaded. Uploads live in IndexedDB rather than
 * localStorage because a photo is megabytes and would blow the 5MB quota.
 */

export type ImageRef = { kind: 'url'; src: string } | { kind: 'blob'; id: string }

const DB_NAME = 'poster.images.v1'
const STORE = 'images'

let seq = 0
const uid = () => `img_${Date.now().toString(36)}_${(seq++).toString(36)}`

/** Open (or create) the database. Resolves null when IndexedDB is unavailable. */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, 1)
    } catch {
      return resolve(null) // private mode / storage disabled
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null)
        try {
          const req = run(db.transaction(STORE, mode).objectStore(STORE))
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

/** Store an uploaded file, returning the reference to keep in the poster state. */
export async function putImageBlob(blob: Blob): Promise<ImageRef | null> {
  const id = uid()
  const ok = await tx('readwrite', (s) => s.put(blob, id) as IDBRequest<IDBValidKey>)
  return ok === null ? null : { kind: 'blob', id }
}

/** Drop every stored upload that no artboard references any more. */
export async function pruneImageBlobs(keep: Iterable<string>): Promise<void> {
  const keepSet = new Set(keep)
  const keys = await tx('readonly', (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>)
  if (!keys) return
  await Promise.all(
    keys
      .filter((k) => typeof k === 'string' && !keepSet.has(k))
      .map((k) => tx('readwrite', (s) => s.delete(k) as unknown as IDBRequest<undefined>)),
  )
}

// Bundled assets (the category placeholders) are referenced by URL and get
// re-requested every time a category is applied. The bytes come from the HTTP
// cache, but the decode doesn't — so hold on to the decoded elements.
const byUrl = new Map<string, HTMLImageElement>()

/** Load an image element for a reference, or null if it can no longer be found. */
export async function loadImageRef(ref: ImageRef): Promise<HTMLImageElement | null> {
  let src: string
  if (ref.kind === 'url') {
    const cached = byUrl.get(ref.src)
    if (cached) return cached
    src = ref.src
  } else {
    const blob = await tx('readonly', (s) => s.get(ref.id) as IDBRequest<Blob | undefined>)
    if (!blob) return null
    src = URL.createObjectURL(blob)
  }
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (ref.kind === 'url') byUrl.set(ref.src, img)
      resolve(img)
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}
