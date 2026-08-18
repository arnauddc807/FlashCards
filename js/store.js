/**
 * IndexedDB persistence. Everything the app knows lives here: decks, cards,
 * the review log, and settings. No network, no accounts — the phone owns the data.
 */

const DB_NAME = 'flashcards';
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('decks')) {
        db.createObjectStore('decks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cards')) {
        const cards = db.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('deckId', 'deckId', { unique: false });
        cards.createIndex('due', 'due', { unique: false });
      }
      if (!db.objectStoreNames.contains('reviews')) {
        const reviews = db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
        reviews.createIndex('ts', 'ts', { unique: false });
        reviews.createIndex('deckId', 'deckId', { unique: false });
        reviews.createIndex('cardId', 'cardId', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      void event;
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database is blocked by another open tab.'));
  });
  return dbPromise;
}

function tx(db, stores, mode) {
  const t = db.transaction(stores, mode);
  const done = new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  });
  return { t, done };
}

function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(storeName, indexName, query) {
  const db = await openDB();
  const { t } = tx(db, [storeName], 'readonly');
  const store = t.objectStore(storeName);
  const source = indexName ? store.index(indexName) : store;
  return reqAsPromise(source.getAll(query));
}

export async function get(storeName, key) {
  const db = await openDB();
  const { t } = tx(db, [storeName], 'readonly');
  return reqAsPromise(t.objectStore(storeName).get(key));
}

export async function put(storeName, value) {
  const db = await openDB();
  const { t, done } = tx(db, [storeName], 'readwrite');
  t.objectStore(storeName).put(value);
  await done;
  return value;
}

export async function putMany(storeName, values) {
  if (!values.length) return 0;
  const db = await openDB();
  const { t, done } = tx(db, [storeName], 'readwrite');
  const store = t.objectStore(storeName);
  for (const v of values) store.put(v);
  await done;
  return values.length;
}

export async function del(storeName, key) {
  const db = await openDB();
  const { t, done } = tx(db, [storeName], 'readwrite');
  t.objectStore(storeName).delete(key);
  await done;
}

export async function clearStore(storeName) {
  const db = await openDB();
  const { t, done } = tx(db, [storeName], 'readwrite');
  t.objectStore(storeName).clear();
  await done;
}

/** Add a review-log entry and update its card in one atomic transaction. */
export async function commitReview(card, log) {
  const db = await openDB();
  const { t, done } = tx(db, ['cards', 'reviews'], 'readwrite');
  t.objectStore('cards').put(card);
  t.objectStore('reviews').add(log);
  await done;
}

/** Delete a deck together with every card and review that belongs to it. */
export async function deleteDeckCascade(deckId) {
  const db = await openDB();
  const { t, done } = tx(db, ['decks', 'cards', 'reviews'], 'readwrite');
  t.objectStore('decks').delete(deckId);

  const cardIndex = t.objectStore('cards').index('deckId');
  cardIndex.openCursor(IDBKeyRange.only(deckId)).onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) { cursor.delete(); cursor.continue(); }
  };

  const reviewIndex = t.objectStore('reviews').index('deckId');
  reviewIndex.openCursor(IDBKeyRange.only(deckId)).onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) { cursor.delete(); cursor.continue(); }
  };

  await done;
}

export async function cardsForDeck(deckId) {
  return getAll('cards', 'deckId', IDBKeyRange.only(deckId));
}

export async function reviewsForDeck(deckId) {
  return getAll('reviews', 'deckId', IDBKeyRange.only(deckId));
}

export async function reviewsSince(ts) {
  return getAll('reviews', 'ts', IDBKeyRange.lowerBound(ts));
}

export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  return put('meta', { key, value });
}

/** Collision-resistant enough for a single-device app. */
export function uid(prefix = 'id') {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Date.now().toString(36)}_${rand[0].toString(36)}${rand[1].toString(36)}`;
}

/** Whole-database snapshot, for the backup button in Settings. */
export async function exportAll() {
  const [decks, cards, reviews, meta] = await Promise.all([
    getAll('decks'), getAll('cards'), getAll('reviews'), getAll('meta'),
  ]);
  return {
    format: 'flashcards-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    decks, cards, reviews, meta,
  };
}

/** Restore a snapshot, replacing everything currently stored. */
export async function importAll(snapshot) {
  if (!snapshot || snapshot.format !== 'flashcards-backup') {
    throw new Error('Not a Flashcards backup file.');
  }
  const db = await openDB();
  const { t, done } = tx(db, ['decks', 'cards', 'reviews', 'meta'], 'readwrite');
  for (const name of ['decks', 'cards', 'reviews', 'meta']) {
    t.objectStore(name).clear();
  }
  for (const d of snapshot.decks || []) t.objectStore('decks').put(d);
  for (const c of snapshot.cards || []) t.objectStore('cards').put(c);
  for (const r of snapshot.reviews || []) {
    const { id, ...rest } = r;
    void id;
    t.objectStore('reviews').add(rest);
  }
  for (const m of snapshot.meta || []) t.objectStore('meta').put(m);
  await done;
}

/** Rough storage footprint, shown in Settings. */
export async function estimateUsage() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}
