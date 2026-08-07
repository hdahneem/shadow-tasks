import '@testing-library/jest-dom/vitest';

// zustand's `persist` middleware reads the global `localStorage` binding directly.
// Node 22+ ships its own experimental `localStorage` global that throws unless a
// --localstorage-file flag is passed, and it wins over jsdom's version here — so
// swap in a minimal in-memory polyfill rather than fighting that global collision.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
});
