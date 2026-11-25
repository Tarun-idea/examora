/**
 * Lazy loader for Firebase SDK (Auth + Firestore) so the ~1.6 MB Firebase
 * runtime is never downloaded or parsed before the Welcome / Auth screens paint.
 */
type FirebaseModule = typeof import('./firebase.ts');

let cachedModule: FirebaseModule | null = null;
let loadPromise: Promise<FirebaseModule> | null = null;

export function getLoadedFirebaseModule(): FirebaseModule | null {
  return cachedModule;
}

export function loadFirebaseModule(): Promise<FirebaseModule> {
  if (cachedModule) {
    return Promise.resolve(cachedModule);
  }
  if (!loadPromise) {
    loadPromise = import('./firebase.ts')
      .then((mod) => {
        cachedModule = mod;
        return mod;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
  }
  return loadPromise;
}

export function preloadFirebaseModule(): void {
  if (!cachedModule && !loadPromise) {
    void loadFirebaseModule().catch(() => {
      // Ignore preload errors; interactive callers will handle errors explicitly
    });
  }
}
