import 'dotenv/config';
import compression from 'compression';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, setLogLevel } from 'firebase/firestore';
import {
  ServerAdminAuthService,
  hashStudentPassword,
  isHashedStudentPassword,
  verifyStudentPassword,
  sanitizeText,
  sanitizeSafeUrl,
  SlidingWindowRateLimiter,
} from './serverAuth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prevent transient background network/Firestore errors from crashing the server process
process.on('unhandledRejection', (reason) => {
  console.error('[ExamFlow] Unhandled promise rejection (kept alive):', reason);
});

// Keep live-mutated runtime state & admin auth hashes in a hidden, gitignored dot-folder
// so it persists across container restarts WITHOUT showing up or causing errors in the IDE file tree.
const DATA_DIR =
  process.env.EXAMFLOW_DATA_DIR || path.join(__dirname, '.examflow-store');
const DATA_ASSETS_DIR = path.join(DATA_DIR, 'assets');
const PUBLIC_ASSETS_DIR = path.join(__dirname, 'public', 'assets');
const STATE_FILE = path.join(DATA_DIR, 'examflow_shared_state.json');
const adminAuth = new ServerAdminAuthService(DATA_DIR);
let lastPersistedStateJson = '';

// Initialize server-side Firestore client (for cold-start cross-device state hydration & mirroring)
let serverFirestoreDb: ReturnType<typeof getFirestore> | null = null;
try {
  const fbConfigPath = path.join(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(fbConfigPath)) {
    const fbConfig = JSON.parse(fs.readFileSync(fbConfigPath, 'utf-8'));
    setLogLevel('silent');
    const fbApp =
      getApps().length > 0 ? getApps()[0] : initializeApp(fbConfig, 'examflow-server');
    serverFirestoreDb = getFirestore(
      fbApp,
      fbConfig.firestoreDatabaseId || 'ai-studio-2008-02d43818-3203-4254-81eb-0898309acdc4'
    );
  }
} catch {
  serverFirestoreDb = null;
}

interface SharedSyncPayload {
  updatedAt: number;
  state: Record<string, any>;
}

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_ASSETS_DIR)) {
      fs.mkdirSync(DATA_ASSETS_DIR, { recursive: true });
    }
  } catch {
    // ignore fs errors on read-only mounts
  }
}

function writeFileAtomic(filePath: string, content: string | Buffer) {
  ensureDataDir();
  fs.writeFileSync(filePath, content);
}

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  png: 'png',
  jpeg: 'jpg',
  jpg: 'jpg',
  webp: 'webp',
  gif: 'gif',
  'svg+xml': 'svg',
};

const ASSET_EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

/**
 * Extracts oversized inline base64 data:image/... strings into real binary image files
 * under data/assets/ so examflow_shared_state.json stays compact, fast, and easy to inspect/download.
 */
function externalizeInlineImageDataUrl(rawUrl?: string): {
  url: string;
  migrated: boolean;
} {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { url: rawUrl || '', migrated: false };
  }
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('data:image/') || trimmed.length <= 2048) {
    return { url: trimmed, migrated: false };
  }
  const match = trimmed.match(
    /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (!match) {
    return { url: trimmed, migrated: false };
  }
  const mimeSub = match[1].toLowerCase();
  const ext = IMAGE_MIME_TO_EXT[mimeSub];
  if (!ext) {
    return { url: trimmed, migrated: false };
  }
  try {
    const cleanB64 = match[2].replace(/\s+/g, '');
    const buffer = Buffer.from(cleanB64, 'base64');
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      return { url: trimmed, migrated: false };
    }
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
    const filename = `college-logo-${hash}.${ext}`;
    const destPath = path.join(DATA_ASSETS_DIR, filename);
    ensureDataDir();
    if (!fs.existsSync(destPath)) {
      writeFileAtomic(destPath, buffer);
    }
    return { url: `/api/assets/${filename}`, migrated: true };
  } catch {
    return { url: trimmed, migrated: false };
  }
}

const VALID_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

function normalizeServerSection(sec?: string): string {
  if (!sec) return 'A';
  const clean = String(sec)
    .replace(/^section\s+/i, '')
    .trim()
    .toUpperCase();
  if (VALID_SECTIONS.includes(clean)) return clean;
  const firstChar = clean.charAt(0);
  if (VALID_SECTIONS.includes(firstChar)) return firstChar;
  return 'L';
}

function normalizeAndDedupeServerSections(arr?: any[]): string[] {
  if (!Array.isArray(arr)) return ['A'];
  if (arr.length === 0) return [];
  const unique = Array.from(new Set(arr.map((c) => normalizeServerSection(String(c)))));
  return unique.sort((a, b) => VALID_SECTIONS.indexOf(a) - VALID_SECTIONS.indexOf(b));
}

function isCorruptedMojibakeText(text?: string): boolean {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (!trimmed) return true;
  let badCount = 0;
  let asciiAlphaNum = 0;
  let printableAscii = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57)
    ) {
      asciiAlphaNum++;
      printableAscii++;
    } else if (code >= 32 && code <= 126) {
      printableAscii++;
    } else if (
      code < 32 &&
      code !== 9 &&
      code !== 10 &&
      code !== 13
    ) {
      badCount += 2;
    } else if (code >= 127 && code <= 255) {
      badCount++;
    } else if (code === 65533) {
      badCount += 2;
    }
  }
  if (asciiAlphaNum === 0) {
    // Allow standalone printable ASCII code/symbol lines such as `{`, `}`, `};`, `* * *`, `---`
    return !(badCount === 0 && printableAscii > 0);
  }
  return badCount / trimmed.length > 0.12;
}

function sortServerStudentsBySectionAndName(students: any[]): any[] {
  return [...students].sort((a, b) => {
    const secA = normalizeServerSection(a?.section);
    const secB = normalizeServerSection(b?.section);
    const idxA = VALID_SECTIONS.indexOf(secA);
    const idxB = VALID_SECTIONS.indexOf(secB);
    if (idxA !== idxB) return idxA - idxB;

    const nameCmp = String(a?.name || '')
      .trim()
      .localeCompare(String(b?.name || '').trim(), undefined, { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;

    return String(a?.studentId || '')
      .trim()
      .localeCompare(String(b?.studentId || '').trim(), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
  });
}

const LEGACY_PURGED_QUESTION_IDS = new Set([
  'q-1793854326823-a32',
  'q-1793854397160-tms',
  'q-1793854455536-6bj',
  'q-1793861915239-f4y',
  'q-1793856022167-ruw',
  'q-1793860253544-gue',
  'q-1793854611447-2l5',
  'q-1793861853240-iur',
  'q-1793854501466-mtu',
  'q-1793860336057-zmg',
]);

function sanitizeStudentRecord(raw: any): any {
  const s = raw && typeof raw === 'object' ? { ...raw } : {};
  const cleanStudentId = sanitizeText(String(s.studentId || ''), 64).toUpperCase();
  const rawPlainPass = typeof s.password === 'string' ? s.password.trim() : '';
  const rawHashPass = typeof s.passwordHash === 'string' ? s.passwordHash.trim() : '';

  let passwordHash = '';
  if (rawPlainPass) {
    passwordHash = hashStudentPassword(rawPlainPass);
  } else if (rawHashPass) {
    passwordHash = hashStudentPassword(rawHashPass);
  } else if (cleanStudentId) {
    passwordHash = hashStudentPassword(cleanStudentId);
  }

  delete s.password;
  delete s.hasPassword;

  return {
    ...s,
    studentId: cleanStudentId || String(s.studentId || ''),
    name: sanitizeText(String(s.name || ''), 160) || `Student ${cleanStudentId}`,
    email: sanitizeText(String(s.email || ''), 160),
    department: sanitizeText(String(s.department || ''), 160),
    year: sanitizeText(String(s.year || ''), 40),
    section: normalizeServerSection(s.section),
    phone: s.phone !== undefined ? sanitizeText(String(s.phone), 40) : undefined,
    dateOfBirth:
      s.dateOfBirth !== undefined ? sanitizeText(String(s.dateOfBirth), 40) : undefined,
    gender: s.gender !== undefined ? sanitizeText(String(s.gender), 40) : undefined,
    cgpa: s.cgpa !== undefined ? sanitizeText(String(s.cgpa), 20) : undefined,
    address: s.address !== undefined ? sanitizeText(String(s.address), 300) : undefined,
    city: s.city !== undefined ? sanitizeText(String(s.city), 100) : undefined,
    guardianName:
      s.guardianName !== undefined ? sanitizeText(String(s.guardianName), 160) : undefined,
    guardianPhone:
      s.guardianPhone !== undefined ? sanitizeText(String(s.guardianPhone), 40) : undefined,
    linkedinUrl:
      s.linkedinUrl !== undefined ? sanitizeSafeUrl(s.linkedinUrl, false) : undefined,
    githubUrl:
      s.githubUrl !== undefined ? sanitizeSafeUrl(s.githubUrl, false) : undefined,
    skills: s.skills !== undefined ? sanitizeText(String(s.skills), 500) : undefined,
    bio: s.bio !== undefined ? sanitizeText(String(s.bio), 1500) : undefined,
    passwordHash,
  };
}

function sanitizeServerStateCollections(stateObj: Record<string, any>): Record<string, any> {
  if (!stateObj || typeof stateObj !== 'object') return stateObj;
  if (Array.isArray(stateObj.students)) {
    stateObj.students = sortServerStudentsBySectionAndName(
      stateObj.students.map((s: any) => sanitizeStudentRecord(s))
    );
  }
  if (Array.isArray(stateObj.subjects)) {
    stateObj.subjects = stateObj.subjects.map((sub: any) => {
      const clean = normalizeAndDedupeServerSections(sub.cohorts);
      return {
        ...sub,
        cohorts: clean.length > 0 ? clean : ['A'],
      };
    });
  }
  if (Array.isArray(stateObj.questions)) {
    stateObj.questions = stateObj.questions
      .filter(
        (q: any) =>
          q &&
          typeof q === 'object' &&
          !LEGACY_PURGED_QUESTION_IDS.has(String(q.id || '')) &&
          !isCorruptedMojibakeText(q.text)
      )
      .map((q: any) => {
        if (q.type === 'programming' && typeof q.starterCode === 'string') {
          const code = q.starterCode.trim();
          const hasTodo = /\bTODO\b/i.test(code);
          const hasSolutionOutput =
            /\b(printf|puts|putchar|cout|print|System\.out\.print|Console\.Write|console\.log|fmt\.Print|println!)\b/.test(
              code
            );
          if (!hasTodo && hasSolutionOutput) {
            const lang = String(q.programmingLanguage || 'c').toLowerCase();
            const fallbackStarter =
              lang === 'python'
                ? "# Write your Python solution below\n\ndef solve():\n    # TODO: Implement logic and print the required output\n    pass\n\nif __name__ == '__main__':\n    solve()"
                : lang === 'cpp'
                ? '#include <iostream>\nusing namespace std;\n\nint main() {\n    // TODO: Read input from cin, implement your solution, and print output\n    return 0;\n}'
                : lang === 'java'
                ? 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // TODO: Read input, implement your solution, and print output\n    }\n}'
                : '#include <stdio.h>\n\nint main() {\n    // TODO: Read input using scanf, implement your solution, and print the result using printf\n    return 0;\n}';
            return {
              ...q,
              starterCode: fallbackStarter,
            };
          }
        }
        return q;
      });
  }
  if (Array.isArray(stateObj.exams)) {
    const qByExam = new Map<string, number>();
    if (Array.isArray(stateObj.questions)) {
      for (const q of stateObj.questions) {
        if (q?.examId) {
          qByExam.set(
            q.examId,
            (qByExam.get(q.examId) || 0) + (Number(q.marks) || 0)
          );
        }
      }
    }
    stateObj.exams = stateObj.exams.map((ex: any) => {
      const qMarks = qByExam.get(ex.id) || 0;
      const cohorts = Array.isArray(ex.assignedCohorts)
        ? normalizeAndDedupeServerSections(ex.assignedCohorts)
        : [...VALID_SECTIONS];
      const studentSet = new Set<string>(
        Array.isArray(ex.assignedStudentIds) ? ex.assignedStudentIds : []
      );
      if (Array.isArray(stateObj.students)) {
        for (const s of stateObj.students) {
          if (s?.id && cohorts.includes(normalizeServerSection(s.section))) {
            studentSet.add(s.id);
          }
        }
      }
      return {
        ...ex,
        status: ex.status || 'Published',
        totalMarks: qMarks > 0 ? qMarks : ex.totalMarks,
        assignedCohorts: cohorts,
        assignedStudentIds: Array.from(studentSet),
      };
    });
  }
  // Never persist or return plaintext Admin passwords in shared state,
  // and extract oversized inline base64 logos into real image files under data/assets/
  if (stateObj.settings && typeof stateObj.settings === 'object') {
    if ('adminPassword' in stateObj.settings) {
      const { adminPassword: _removed, ...safeSettings } = stateObj.settings;
      stateObj.settings = safeSettings;
    }
    if ('websiteUrl' in stateObj.settings) {
      stateObj.settings = {
        ...stateObj.settings,
        websiteUrl: sanitizeSafeUrl(stateObj.settings.websiteUrl, false),
      };
    }
    const currentLogo = String(stateObj.settings.collegeLogoUrl || '').trim();
    if (
      !currentLogo ||
      currentLogo.includes('college-logo-bd9fb83a48b7') ||
      currentLogo.startsWith('/assets/aistudio/')
    ) {
      stateObj.settings = {
        ...stateObj.settings,
        collegeLogoUrl: '/assets/panimalar-crest.png',
      };
      stateObj.settingsUpdatedAt = Math.max(
        Date.now(),
        Number(stateObj.settingsUpdatedAt || 0) + 1
      );
    } else {
      const extRes = externalizeInlineImageDataUrl(currentLogo);
      if (extRes.migrated) {
        stateObj.settings = {
          ...stateObj.settings,
          collegeLogoUrl: extRes.url,
        };
        stateObj.settingsUpdatedAt = Math.max(
          Date.now(),
          Number(stateObj.settingsUpdatedAt || 0) + 1
        );
      } else if (!currentLogo.startsWith('data:image/')) {
        const safeLogo = sanitizeSafeUrl(currentLogo, true);
        stateObj.settings = {
          ...stateObj.settings,
          collegeLogoUrl: safeLogo || '/assets/panimalar-crest.png',
        };
      }
    }
  }
  return stateObj;
}

let needsFirestoreHashSync = false;

function hasPlaintextStudentPasswords(stateObj?: Record<string, any>): boolean {
  if (!stateObj || !Array.isArray(stateObj.students)) return false;
  return stateObj.students.some(
    (s: any) =>
      s &&
      typeof s === 'object' &&
      ((typeof s.password === 'string' && s.password.trim().length > 0) ||
        (typeof s.passwordHash === 'string' &&
          s.passwordHash.trim().length > 0 &&
          !isHashedStudentPassword(s.passwordHash)) ||
        (!s.password && !s.passwordHash))
  );
}

function loadServerState(): SharedSyncPayload {
  try {
    ensureDataDir();
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.state) {
        const legacyEmail = parsed.state?.settings?.adminEmail;
        const legacyPass = parsed.state?.settings?.adminPassword;
        adminAuth.migrateLegacyAdminCredentials(legacyEmail, legacyPass);

        const hadPlaintextPass = Boolean(
          parsed.state?.settings && 'adminPassword' in parsed.state.settings
        );
        const hadPlaintextStudentPass = hasPlaintextStudentPasswords(parsed.state);
        const rawLogoOnDisk = String(parsed.state?.settings?.collegeLogoUrl || '').trim();
        const hadLegacyOrOversizedLogo =
          !rawLogoOnDisk ||
          rawLogoOnDisk.includes('college-logo-bd9fb83a48b7') ||
          rawLogoOnDisk.startsWith('/assets/aistudio/') ||
          (rawLogoOnDisk.startsWith('data:image/') && rawLogoOnDisk.length > 2048);

        parsed.state = sanitizeServerStateCollections(parsed.state);
        const serializedState = JSON.stringify(parsed.state);
        lastPersistedStateJson = serializedState;

        if (hadPlaintextPass || hadLegacyOrOversizedLogo || hadPlaintextStudentPass) {
          needsFirestoreHashSync = true;
          try {
            writeFileAtomic(STATE_FILE, JSON.stringify(parsed, null, 2));
          } catch {
            // ignore write errors
          }
        }
        return parsed as SharedSyncPayload;
      }
    }
  } catch {
    // ignore read errors
  }
  return {
    updatedAt: 0,
    state: {},
  };
}

let memoryStore: SharedSyncPayload = loadServerState();

function hasMeaningfulState(st?: Record<string, any>): boolean {
  if (!st || typeof st !== 'object') return false;
  return (
    Number(st.adminUpdatedAt || 0) > 0 ||
    (Array.isArray(st.students) && st.students.length > 0) ||
    (Array.isArray(st.subjects) && st.subjects.length > 0) ||
    (Array.isArray(st.exams) && st.exams.length > 0)
  );
}

function saveServerState(payload: SharedSyncPayload, mirrorToFirestore = false) {
  payload.state = sanitizeServerStateCollections(payload.state);
  const nextStateJson = JSON.stringify(payload.state);
  memoryStore = payload;
  if (nextStateJson !== lastPersistedStateJson || !fs.existsSync(STATE_FILE)) {
    try {
      writeFileAtomic(STATE_FILE, JSON.stringify(payload, null, 2));
      lastPersistedStateJson = nextStateJson;
    } catch {
      // ignore write errors if ephemeral filesystem
    }
  }
  if (mirrorToFirestore && serverFirestoreDb && nextStateJson.length <= 940000) {
    void setDoc(doc(serverFirestoreDb, 'examflow_sync', 'live_state'), {
      updatedAt: payload.updatedAt || Date.now(),
      payloadJson: nextStateJson,
    }).catch(() => {
      // non-fatal background mirror
    });
  }
}

let firestoreHydrationPromise: Promise<void> | null = null;

function hydrateServerStateFromFirestore(): Promise<void> {
  if (!serverFirestoreDb) return Promise.resolve();
  if (firestoreHydrationPromise) return firestoreHydrationPromise;

  const fetchTask = (async () => {
    try {
      const snap = await getDoc(doc(serverFirestoreDb!, 'examflow_sync', 'live_state'));
      if (!snap.exists()) return;
      const data = snap.data();
      if (!data || typeof data.payloadJson !== 'string') return;
      const remoteState = JSON.parse(data.payloadJson);
      if (!hasMeaningfulState(remoteState)) return;

      const remoteHadPlaintextPass =
        hasPlaintextStudentPasswords(remoteState) ||
        Boolean(remoteState?.settings && 'adminPassword' in remoteState.settings);

      const remoteUpdatedAt = Number(data.updatedAt || Date.now());
      const localHasData = hasMeaningfulState(memoryStore.state);
      const mergedState = localHasData
        ? mergeServerStates(memoryStore.state, remoteState, 'admin')
        : remoteState;

      // Ensure official Panimalar Engineering College crest is always used instead of retired/empty logo paths
      const remoteLogo = String(mergedState.settings?.collegeLogoUrl || '').trim();
      const shouldPushCleanedLogo =
        !remoteLogo ||
        remoteLogo.includes('college-logo-bd9fb83a48b7') ||
        remoteLogo.startsWith('/assets/aistudio/');
      if (shouldPushCleanedLogo) {
        mergedState.settings = {
          ...(mergedState.settings || {}),
          collegeLogoUrl: '/assets/panimalar-crest.png',
        };
      }

      if (typeof mergedState?.settings?.adminEmail === 'string') {
        adminAuth.syncRecoveryEmail(mergedState.settings.adminEmail);
      }

      const shouldMirrorCleanToFirestore =
        shouldPushCleanedLogo || remoteHadPlaintextPass || needsFirestoreHashSync;
      needsFirestoreHashSync = false;

      saveServerState(
        {
          updatedAt: Math.max(memoryStore.updatedAt || 0, remoteUpdatedAt),
          state: mergedState,
        },
        shouldMirrorCleanToFirestore
      );
    } catch {
      // non-fatal: fall back to local cache
    }
  })();

  // Bound initial boot hydration wait to 4 seconds so endpoints never hang
  firestoreHydrationPromise = Promise.race([
    fetchTask,
    new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  ]);
  return firestoreHydrationPromise;
}

// Kick off Cloud Firestore hydration immediately on server startup
void hydrateServerStateFromFirestore();

function mergeArrayById(
  existingArr: any[] = [],
  incomingArr: any[] = [],
  deletedSet: Set<string>,
  isStudentArray = false,
  isAttemptArray = false,
  preferIncoming = false
): any[] {
  const map = new Map<string, any>();
  const stuIdToKey = new Map<string, string>();

  const statusRank: Record<string, number> = {
    'in-progress': 1,
    submitted: 2,
    evaluated: 3,
    published: 4,
  };

  const processItem = (item: any, fromIncoming: boolean) => {
    if (!item || typeof item !== 'object') return;
    const id = String(item.id || '');
    if (!id || deletedSet.has(id) || LEGACY_PURGED_QUESTION_IDS.has(id)) return;

    const normStuId =
      isStudentArray && item.studentId
        ? String(item.studentId).trim().toUpperCase()
        : '';

    if (normStuId) {
      const stuKey = `stuid:${normStuId.toLowerCase()}`;
      if (deletedSet.has(stuKey)) return;
    }

    const idMatch = map.has(id) ? id : undefined;
    const stuMatch = normStuId ? stuIdToKey.get(normStuId) : undefined;
    const matchedKey = idMatch || stuMatch;

    if (!matchedKey) {
      map.set(id, item);
      if (normStuId) {
        stuIdToKey.set(normStuId, id);
      }
      return;
    }

    const prevIdObj = idMatch ? map.get(idMatch) : undefined;
    const prevStuObj = stuMatch ? map.get(stuMatch) : undefined;
    const prev =
      prevIdObj && prevStuObj && idMatch !== stuMatch
        ? Number(prevIdObj.updatedAtMs || 0) >= Number(prevStuObj.updatedAtMs || 0)
          ? prevIdObj
          : prevStuObj
        : prevIdObj || prevStuObj;

    if (!prev) {
      map.set(id, item);
      if (normStuId) {
        stuIdToKey.set(normStuId, id);
      }
      return;
    }

    if (isAttemptArray) {
      const prevRank = statusRank[prev.status] || 0;
      const nextRank = statusRank[item.status] || 0;
      if (nextRank > prevRank) {
        map.set(matchedKey, item);
        return;
      }
      if (nextRank < prevRank) {
        return;
      }
    }

    const prevTime = Number(prev.updatedAtMs || 0);
    const nextTime = Number(item.updatedAtMs || 0);
    if ((fromIncoming && preferIncoming) || nextTime >= prevTime) {
      if (idMatch && idMatch !== id) map.delete(idMatch);
      if (stuMatch && stuMatch !== id) map.delete(stuMatch);
      if (isStudentArray) {
        if (prevIdObj?.studentId) {
          stuIdToKey.delete(String(prevIdObj.studentId).trim().toUpperCase());
        }
        if (prevStuObj?.studentId) {
          stuIdToKey.delete(String(prevStuObj.studentId).trim().toUpperCase());
        }
      }
      const merged: any = { ...prev, ...item, id };
      if (isStudentArray) {
        const incomingPlain =
          typeof item.password === 'string' ? item.password.trim() : '';
        const incomingHash =
          typeof item.passwordHash === 'string' ? item.passwordHash.trim() : '';
        if (incomingPlain) {
          merged.passwordHash = hashStudentPassword(incomingPlain);
        } else if (incomingHash) {
          merged.passwordHash = hashStudentPassword(incomingHash);
        } else if (prev.passwordHash) {
          merged.passwordHash = prev.passwordHash;
        } else if (typeof prev.password === 'string' && prev.password.trim()) {
          merged.passwordHash = hashStudentPassword(prev.password.trim());
        }
        delete merged.password;
      }
      map.set(id, merged);
      if (normStuId) {
        stuIdToKey.set(normStuId, id);
      }
    } else if (idMatch && stuMatch && idMatch !== stuMatch) {
      // Keep the newer existing record and drop the duplicate key
      const winnerKey =
        Number(prevIdObj?.updatedAtMs || 0) >= Number(prevStuObj?.updatedAtMs || 0)
          ? idMatch
          : stuMatch;
      const loserKey = winnerKey === idMatch ? stuMatch : idMatch;
      map.delete(loserKey);
    }
  };

  for (const item of existingArr) processItem(item, false);
  for (const item of incomingArr) processItem(item, true);

  const uniqueOut: any[] = [];
  const seenIds = new Set<string>();
  const seenStuIds = new Set<string>();
  for (const val of map.values()) {
    const vid = String(val?.id || '');
    if (!vid || seenIds.has(vid)) continue;
    if (isStudentArray && val?.studentId) {
      const vsid = String(val.studentId).trim().toUpperCase();
      if (vsid && seenStuIds.has(vsid)) continue;
      if (vsid) seenStuIds.add(vsid);
    }
    seenIds.add(vid);
    uniqueOut.push(val);
  }
  return uniqueOut;
}

function mergeServerStates(
  current: Record<string, any>,
  incoming: Record<string, any>,
  role: 'admin' | 'student' | 'anonymous' = 'admin'
): Record<string, any> {
  const hasCurrentData =
    current &&
    Object.keys(current).length > 0 &&
    (Number(current.adminUpdatedAt || 0) > 0 ||
      (Array.isArray(current.students) && current.students.length > 0) ||
      (Array.isArray(current.subjects) && current.subjects.length > 0) ||
      (Array.isArray(current.exams) && current.exams.length > 0));

  if (!hasCurrentData) {
    return incoming || {};
  }
  if (!incoming || Object.keys(incoming).length === 0) {
    return current;
  }

  // Allow incoming payload to mutate Admin-owned collections whenever the request is from Admin
  const currentAdminTime = Number(current.adminUpdatedAt || 0);
  const incomingAdminTime = Number(incoming.adminUpdatedAt || 0);
  const canMutateAdminData = role === 'admin';

  const mergedDeletedTimestamps: Record<string, number> = {};
  for (const [k, v] of Object.entries(current.deletedTimestamps || {})) {
    mergedDeletedTimestamps[k] = Math.max(
      mergedDeletedTimestamps[k] || 0,
      Number(v || 0)
    );
  }
  if (canMutateAdminData) {
    for (const [k, v] of Object.entries(incoming.deletedTimestamps || {})) {
      mergedDeletedTimestamps[k] = Math.max(
        mergedDeletedTimestamps[k] || 0,
        Number(v || 0)
      );
    }
  }

  const deletedIds = Array.from(
    new Set([
      ...(Array.isArray(current.deletedIds) ? current.deletedIds : []),
      ...(canMutateAdminData && Array.isArray(incoming.deletedIds)
        ? incoming.deletedIds
        : []),
      ...Array.from(LEGACY_PURGED_QUESTION_IDS),
    ])
  );
  const deletedSet = new Set<string>(deletedIds);

  const unmarkIfNewer = (items?: any[], isStudent = false) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const itemTime = Number(item.updatedAtMs || 0);
      if (!itemTime) continue;
      const id = String(item.id || '');
      if (LEGACY_PURGED_QUESTION_IDS.has(id)) continue;
      const delTime = mergedDeletedTimestamps[id] || 0;
      if (id && delTime > 0 && itemTime > delTime) {
        deletedSet.delete(id);
        delete mergedDeletedTimestamps[id];
      }
      if (isStudent && item.studentId) {
        const stuKey = `stuid:${String(item.studentId).trim().toLowerCase()}`;
        const stuDelTime = mergedDeletedTimestamps[stuKey] || delTime || 0;
        if (stuDelTime > 0 && itemTime > stuDelTime) {
          deletedSet.delete(stuKey);
          deletedSet.delete(id);
          delete mergedDeletedTimestamps[stuKey];
          delete mergedDeletedTimestamps[id];
        }
      }
    }
  };

  if (!canMutateAdminData) {
    unmarkIfNewer(current.students, true);
    unmarkIfNewer(current.subjects);
    unmarkIfNewer(current.exams);
    unmarkIfNewer(current.questions);
  } else {
    unmarkIfNewer(incoming.students, true);
    unmarkIfNewer(incoming.subjects);
    unmarkIfNewer(incoming.exams);
    unmarkIfNewer(incoming.questions);
  }

  const students = canMutateAdminData
    ? mergeArrayById(current.students, incoming.students, deletedSet, true, false, true)
    : mergeArrayById(current.students, [], deletedSet, true, false);

  const subjects = canMutateAdminData
    ? mergeArrayById(current.subjects, incoming.subjects, deletedSet, false, false, true)
    : mergeArrayById(current.subjects, [], deletedSet);

  const exams = canMutateAdminData
    ? mergeArrayById(current.exams, incoming.exams, deletedSet, false, false, true)
    : mergeArrayById(current.exams, [], deletedSet);

  const questions = canMutateAdminData
    ? mergeArrayById(current.questions, incoming.questions, deletedSet, false, false, true)
    : mergeArrayById(current.questions, [], deletedSet);

  const attempts = mergeArrayById(
    current.attempts,
    incoming.attempts,
    deletedSet,
    false,
    true
  );
  const violations = mergeArrayById(
    current.violations,
    incoming.violations,
    deletedSet
  );
  const certificates = mergeArrayById(
    current.certificates,
    incoming.certificates,
    deletedSet
  );
  const activities = mergeArrayById(
    current.activities,
    incoming.activities,
    deletedSet
  ).slice(0, 25);

  const currentSettingsTime = Number(current.settingsUpdatedAt || 0);
  const incomingSettingsTime = canMutateAdminData
    ? Number(incoming.settingsUpdatedAt || 0)
    : 0;
  const settings = canMutateAdminData
    ? { ...(current.settings || {}), ...(incoming.settings || {}) }
    : { ...(incoming.settings || {}), ...(current.settings || {}) };

  const currentTemplateTime = Number(current.templateUpdatedAt || 0);
  const incomingTemplateTime = canMutateAdminData
    ? Number(incoming.templateUpdatedAt || 0)
    : 0;
  const certificateTemplate = canMutateAdminData
    ? {
        ...(current.certificateTemplate || {}),
        ...(incoming.certificateTemplate || {}),
      }
    : {
        ...(incoming.certificateTemplate || {}),
        ...(current.certificateTemplate || {}),
      };

  return {
    subjects,
    students,
    exams,
    questions,
    attempts,
    violations,
    certificates,
    certificateTemplate,
    activities,
    settings,
    deletedIds: Array.from(deletedSet),
    deletedTimestamps: mergedDeletedTimestamps,
    settingsUpdatedAt: Math.max(currentSettingsTime, incomingSettingsTime),
    templateUpdatedAt: Math.max(currentTemplateTime, incomingTemplateTime),
    adminUpdatedAt: Math.max(
      currentAdminTime,
      canMutateAdminData ? incomingAdminTime : 0
    ),
  };
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(compression({ threshold: 1024 }));
  app.use(express.json({ limit: '30mb' }));

  const isHttpsRequest = (req: express.Request): boolean => {
    if (req.secure) return true;
    const xfProto = String(req.headers['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    if (xfProto === 'https') return true;
    const origin = String(req.headers.origin || '').trim().toLowerCase();
    if (origin.startsWith('https://')) return true;
    const referer = String(req.headers.referer || '').trim().toLowerCase();
    if (referer.startsWith('https://')) return true;
    return false;
  };

  // Global HTTP Security Headers (omits X-Frame-Options so AI Studio preview iframe works seamlessly)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), geolocation=(), microphone=(), payment=(), usb=()'
    );
    if (isHttpsRequest(req)) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains'
      );
    }
    next();
  });

  // Strict Same-Origin CORS Guard on all /api/* routes (never exposes wildcard ACAO)
  app.use('/api', (req, res, next) => {
    const originHeader = String(req.headers.origin || '').trim();
    if (originHeader) {
      const expectedHost = String(
        req.headers['x-forwarded-host'] || req.headers.host || ''
      )
        .split(',')[0]
        .trim()
        .toLowerCase();
      let originHost = '';
      try {
        originHost = new URL(originHeader).host.toLowerCase();
      } catch {
        originHost = '';
      }
      if (!originHost || !expectedHost || originHost !== expectedHost) {
        res.status(403).json({
          ok: false,
          error: 'Cross-origin API requests are not permitted.',
        });
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', originHeader);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With'
      );
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Per-IP Sliding-Window Rate Limiters (tuned for shared college Wi-Fi NAT networks)
  const adminLoginLimiter = new SlidingWindowRateLimiter(15, 15 * 60 * 1000);
  const studentLoginLimiter = new SlidingWindowRateLimiter(40, 15 * 60 * 1000);
  const otpLimiter = new SlidingWindowRateLimiter(10, 15 * 60 * 1000);
  const pdfParseLimiter = new SlidingWindowRateLimiter(20, 10 * 60 * 1000);
  const syncLimiter = new SlidingWindowRateLimiter(300, 5 * 60 * 1000);

  // =========================================================
  // SECURE SERVER-SIDE AUTH, SESSION COOKIES & ROLE SCOPING
  // =========================================================
  const getSettingsAdminEmail = (): string | undefined =>
    typeof memoryStore.state?.settings?.adminEmail === 'string'
      ? memoryStore.state.settings.adminEmail
      : undefined;

  const getSettingsAdminName = (): string | undefined =>
    typeof memoryStore.state?.settings?.adminName === 'string'
      ? memoryStore.state.settings.adminName
      : undefined;

  const ensureHydratedIfEmpty = async () => {
    if (!hasMeaningfulState(memoryStore.state)) {
      await hydrateServerStateFromFirestore();
    }
  };

  const getClientIpKey = (req: express.Request): string =>
    String(
      req.headers['x-forwarded-for'] ||
        req.socket?.remoteAddress ||
        'unknown-client'
    )
      .split(',')[0]
      .trim();

  const ADMIN_SESSION_COOKIE = 'examflow_admin_session';
  const STUDENT_SESSION_COOKIE = 'examflow_student_session';
  const SESSION_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60; // 1 year (persists until explicit Logout)

  const parseCookieValue = (
    cookieHeader: string | undefined,
    name: string
  ): string | undefined => {
    if (!cookieHeader || typeof cookieHeader !== 'string') return undefined;
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const key = part.slice(0, eqIdx).trim();
      if (key === name) {
        try {
          return decodeURIComponent(part.slice(eqIdx + 1).trim());
        } catch {
          return part.slice(eqIdx + 1).trim();
        }
      }
    }
    return undefined;
  };

  const appendSetCookie = (res: express.Response, cookieValue: string) => {
    const existing = res.getHeader('Set-Cookie');
    if (!existing) {
      res.setHeader('Set-Cookie', cookieValue);
    } else if (Array.isArray(existing)) {
      res.setHeader('Set-Cookie', [...existing, cookieValue]);
    } else {
      res.setHeader('Set-Cookie', [String(existing), cookieValue]);
    }
  };

  const setSessionCookie = (
    req: express.Request,
    res: express.Response,
    cookieName: string,
    token: string
  ) => {
    const attrs = [
      `${cookieName}=${encodeURIComponent(token)}`,
      'HttpOnly',
      'Path=/',
      `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    ];
    if (isHttpsRequest(req)) {
      attrs.push('Secure', 'SameSite=None', 'Partitioned');
    } else {
      attrs.push('SameSite=Lax');
    }
    appendSetCookie(res, attrs.join('; '));
  };

  const clearSessionCookie = (
    req: express.Request,
    res: express.Response,
    cookieName: string
  ) => {
    const attrs = [
      `${cookieName}=`,
      'HttpOnly',
      'Path=/',
      'Max-Age=0',
    ];
    if (isHttpsRequest(req)) {
      attrs.push('Secure', 'SameSite=None', 'Partitioned');
    } else {
      attrs.push('SameSite=Lax');
    }
    appendSetCookie(res, attrs.join('; '));
  };

  const setAdminSessionCookie = (
    req: express.Request,
    res: express.Response,
    token: string
  ) => setSessionCookie(req, res, ADMIN_SESSION_COOKIE, token);

  const clearAdminSessionCookie = (
    req: express.Request,
    res: express.Response
  ) => clearSessionCookie(req, res, ADMIN_SESSION_COOKIE);

  const setStudentSessionCookie = (
    req: express.Request,
    res: express.Response,
    token: string
  ) => setSessionCookie(req, res, STUDENT_SESSION_COOKIE, token);

  const clearStudentSessionCookie = (
    req: express.Request,
    res: express.Response
  ) => clearSessionCookie(req, res, STUDENT_SESSION_COOKIE);

  const verifyCookieCsrf = (req: express.Request): boolean => {
    // Allow requests carrying our explicit non-simple custom header
    const xrw = String(req.headers['x-requested-with'] || '').trim();
    if (xrw === 'ExamFlow-Client') return true;

    // Otherwise verify Origin strictly matches X-Forwarded-Host or Host
    const originHeader = String(req.headers.origin || '').trim();
    const expectedHost = String(
      req.headers['x-forwarded-host'] || req.headers.host || ''
    )
      .split(',')[0]
      .trim()
      .toLowerCase();
    if (!originHeader || !expectedHost) return false;
    try {
      const originHost = new URL(originHeader).host.toLowerCase();
      return originHost === expectedHost;
    } catch {
      return false;
    }
  };

  const resolveAdminSession = (
    req: express.Request,
    requireCsrfForCookie = false
  ) => {
    const bearerSession = adminAuth.verifyBearerHeader(req.headers.authorization);
    if (bearerSession) return bearerSession;

    const cookieToken = parseCookieValue(
      req.headers.cookie,
      ADMIN_SESSION_COOKIE
    );
    if (!cookieToken) return null;
    if (requireCsrfForCookie && !verifyCookieCsrf(req)) {
      return null;
    }
    return adminAuth.verifyToken(cookieToken);
  };

  const resolveStudentSession = (
    req: express.Request,
    requireCsrfForCookie = false
  ) => {
    const cookieToken = parseCookieValue(
      req.headers.cookie,
      STUDENT_SESSION_COOKIE
    );
    if (!cookieToken) return null;
    if (requireCsrfForCookie && !verifyCookieCsrf(req)) {
      return null;
    }
    return adminAuth.verifyStudentSessionToken(cookieToken);
  };

  const findCanonicalStudent = (
    students: any[] | undefined,
    id?: string,
    studentId?: string
  ): any | undefined => {
    if (!Array.isArray(students)) return undefined;
    const cleanId = String(id || '').trim();
    const cleanStuId = String(studentId || '').trim().toLowerCase();
    return students.find(
      (s: any) =>
        (cleanId && String(s?.id || '') === cleanId) ||
        (cleanStuId &&
          String(s?.studentId || '').trim().toLowerCase() === cleanStuId)
    );
  };

  const stripStudentSecrets = (student: any): any => {
    if (!student || typeof student !== 'object') return student;
    const { password: _p, passwordHash: _ph, ...safe } = student;
    return {
      ...safe,
      hasPassword: Boolean(student.passwordHash || student.password),
    };
  };

  const buildStudentUserProfile = (student: any) => ({
    id: student.id,
    name: student.name,
    email: student.email,
    role: 'student' as const,
    studentId: student.studentId,
    department: student.department,
    year: student.year,
    section: normalizeServerSection(student.section),
    phone: student.phone,
    dateOfBirth: student.dateOfBirth,
    gender: student.gender,
    cgpa: student.cgpa,
    address: student.address,
    city: student.city,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    linkedinUrl: student.linkedinUrl,
    githubUrl: student.githubUrl,
    skills: student.skills,
    bio: student.bio,
  });

  const getPublicSummary = (stateObj: Record<string, any>) => {
    const enrolledStudentsCount = Array.isArray(stateObj?.students)
      ? stateObj.students.length
      : 0;
    const liveExamsCount = Array.isArray(stateObj?.exams)
      ? stateObj.exams.filter(
          (e: any) => String(e?.status || '').trim().toLowerCase() !== 'draft'
        ).length
      : 0;
    return {
      enrolledStudentsCount,
      liveExamsCount,
    };
  };

  const buildPublicStateView = (payload: SharedSyncPayload): SharedSyncPayload => {
    const s = payload.state?.settings || {};
    return {
      updatedAt: payload.updatedAt,
      state: {
        subjects: [],
        students: [],
        exams: [],
        questions: [],
        attempts: [],
        violations: [],
        certificates: [],
        activities: [],
        publicSummary: getPublicSummary(payload.state),
        settings: {
          institutionName: s.institutionName || 'Panimalar Engineering College',
          academicSession: s.academicSession || '2025 - 2026 Academic Year',
          adminName: 'Administrator',
          adminEmail: '',
          contactPhone: s.contactPhone || '',
          websiteUrl: s.websiteUrl || '',
          institutionAddress: s.institutionAddress || '',
          timezone: s.timezone || 'UTC+05:30 (Indian Standard Time)',
          themeMode: s.themeMode || 'dark',
          accentColor: s.accentColor || 'blue',
          uiTheme: s.uiTheme,
          collegeLogoUrl: s.collegeLogoUrl || '/assets/panimalar-crest.png',
          enforceFullscreen: s.enforceFullscreen ?? true,
          autoSubmitOnMaxViolations: s.autoSubmitOnMaxViolations ?? true,
          maxViolationsAllowed: s.maxViolationsAllowed ?? 3,
          webcamProctoringDefault: s.webcamProctoringDefault ?? true,
          defaultPassingPercentage: s.defaultPassingPercentage ?? 50,
          lateJoinRemainingTimeOnly: s.lateJoinRemainingTimeOnly ?? true,
        },
        settingsUpdatedAt: payload.state?.settingsUpdatedAt || 0,
        templateUpdatedAt: 0,
        adminUpdatedAt: 0,
      },
    };
  };

  const buildAdminStateView = (payload: SharedSyncPayload): SharedSyncPayload => {
    const students = Array.isArray(payload.state?.students)
      ? payload.state.students.map(stripStudentSecrets)
      : [];
    return {
      updatedAt: payload.updatedAt,
      state: {
        ...payload.state,
        students,
        publicSummary: getPublicSummary(payload.state),
      },
    };
  };

  const buildStudentStateView = (
    payload: SharedSyncPayload,
    student: any
  ): SharedSyncPayload => {
    const st = payload.state || {};
    const studentId = String(student.id);
    const studentSection = normalizeServerSection(student.section);

    const ownAttempts = Array.isArray(st.attempts)
      ? st.attempts.filter((a: any) => String(a?.studentId || '') === studentId)
      : [];
    const ownAttemptExamIds = new Set<string>(
      ownAttempts.map((a: any) => String(a?.examId || ''))
    );

    const allExams = Array.isArray(st.exams) ? st.exams : [];
    const visibleExams = allExams.filter((ex: any) => {
      const status = String(ex?.status || '').trim().toLowerCase();
      if (status === 'draft') return false;
      if (ownAttemptExamIds.has(String(ex?.id || ''))) return true;
      const assignedIds = Array.isArray(ex?.assignedStudentIds)
        ? ex.assignedStudentIds
        : [];
      const assignedCohorts = Array.isArray(ex?.assignedCohorts)
        ? ex.assignedCohorts.map((c: any) => normalizeServerSection(String(c)))
        : [];
      if (assignedIds.length === 0 && assignedCohorts.length === 0) return true;
      return (
        assignedIds.includes(studentId) ||
        assignedCohorts.includes(studentSection)
      );
    });
    const visibleExamIds = new Set<string>(
      visibleExams.map((ex: any) => String(ex?.id || ''))
    );

    const publishedExamIds = new Set<string>();
    for (const att of ownAttempts) {
      if (att?.status === 'published' || att?.resultReleased) {
        publishedExamIds.add(String(att.examId));
      }
    }

    const allQuestions = Array.isArray(st.questions) ? st.questions : [];
    const visibleQuestions = allQuestions
      .filter((q: any) => visibleExamIds.has(String(q?.examId || '')))
      .map((q: any) => {
        const isPublished = publishedExamIds.has(String(q?.examId || ''));
        if (isPublished) {
          return {
            ...q,
            testCases: Array.isArray(q.testCases)
              ? q.testCases.filter((tc: any) => !tc?.isHidden)
              : q.testCases,
          };
        }
        const {
          correctOptionId: _co,
          explanation: _exp,
          sampleRubric: _sr,
          ...safeQ
        } = q;
        return {
          ...safeQ,
          testCases: Array.isArray(q.testCases)
            ? q.testCases.filter((tc: any) => !tc?.isHidden)
            : q.testCases,
        };
      });

    const ownViolations = Array.isArray(st.violations)
      ? st.violations.filter((v: any) => String(v?.studentId || '') === studentId)
      : [];
    const ownCertificates = Array.isArray(st.certificates)
      ? st.certificates.filter(
          (c: any) =>
            String(c?.studentId || '') === studentId &&
            c?.publishedToStudent !== false
        )
      : [];

    const rawSettings = st.settings || {};
    const safeSettings = {
      ...rawSettings,
      adminEmail: '',
      adminName: 'Administrator',
    };
    delete safeSettings.adminPassword;

    return {
      updatedAt: payload.updatedAt,
      state: {
        subjects: Array.isArray(st.subjects) ? st.subjects : [],
        students: [stripStudentSecrets(student)],
        exams: visibleExams,
        questions: visibleQuestions,
        attempts: ownAttempts,
        violations: ownViolations,
        certificates: ownCertificates,
        certificateTemplate: st.certificateTemplate,
        activities: [],
        settings: safeSettings,
        publicSummary: getPublicSummary(st),
        deletedIds: Array.isArray(st.deletedIds) ? st.deletedIds : [],
        deletedTimestamps: st.deletedTimestamps || {},
        settingsUpdatedAt: st.settingsUpdatedAt || 0,
        templateUpdatedAt: st.templateUpdatedAt || 0,
        adminUpdatedAt: st.adminUpdatedAt || 0,
      },
    };
  };

  /**
   * Authoritatively grades student MCQ & descriptive provisional scores on the server
   * using canonical server questions (never trusting client-submitted MCQ scores).
   */
  const gradeStudentAttemptAuthoritatively = (
    incomingAttempt: any,
    existingAttempt: any | undefined,
    canonicalState: Record<string, any>
  ) => {
    if (
      existingAttempt &&
      (existingAttempt.status === 'evaluated' ||
        existingAttempt.status === 'published')
    ) {
      return existingAttempt;
    }

    const isSubmitting =
      incomingAttempt?.status === 'submitted' ||
      incomingAttempt?.status === 'published';
    if (!isSubmitting) {
      // Keep in-progress answers while never allowing client to pre-populate scores
      return {
        ...incomingAttempt,
        status: 'in-progress',
        mcqScore: 0,
        descriptiveScore: 0,
        codingScore: 0,
        totalScore: 0,
        percentage: 0,
        passed: false,
      };
    }

    const exam = Array.isArray(canonicalState.exams)
      ? canonicalState.exams.find((e: any) => e?.id === incomingAttempt.examId)
      : undefined;
    const examQuestions = Array.isArray(canonicalState.questions)
      ? canonicalState.questions.filter(
          (q: any) => q?.examId === incomingAttempt.examId
        )
      : [];

    let mcqScore = 0;
    let descriptiveScore = 0;
    let codingScore = 0;
    let hasDescriptive = false;

    const updatedAnswers: Record<string, any> = {
      ...(incomingAttempt.answers || {}),
    };

    for (const q of examQuestions) {
      const ans = updatedAnswers[q.id];
      if (!ans) continue;
      const qMarks = Math.max(0, Number(q.marks) || 0);

      if (q.type === 'mcq') {
        const isCorrect =
          Boolean(ans.selectedOptionId) &&
          String(ans.selectedOptionId) === String(q.correctOptionId || '');
        const pts = isCorrect ? qMarks : 0;
        mcqScore += pts;
        updatedAnswers[q.id] = { ...ans, awardedMarks: pts };
      } else if (q.type === 'programming') {
        const claimed = Number(ans.awardedMarks || 0);
        const clamped = Number.isFinite(claimed)
          ? Math.max(0, Math.min(qMarks, Math.round(claimed)))
          : 0;
        codingScore += clamped;
        updatedAnswers[q.id] = { ...ans, awardedMarks: clamped };
      } else if (q.type === 'descriptive') {
        hasDescriptive = true;
        const text = sanitizeText(String(ans.descriptiveText || ''), 12000);
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        const provisional = wordCount >= 15 ? Math.round(qMarks * 0.8) : 0;
        descriptiveScore += provisional;
        updatedAnswers[q.id] = {
          ...ans,
          descriptiveText: text,
          awardedMarks: provisional,
        };
      }
    }

    const totalScore = mcqScore + descriptiveScore + codingScore;
    const maxScore =
      examQuestions.reduce(
        (acc: number, q: any) => acc + Math.max(0, Number(q.marks) || 0),
        0
      ) ||
      Number(incomingAttempt.maxScore) ||
      60;
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const passingMarks = exam?.passingMarks ?? Math.ceil(maxScore * 0.5);
    const passed = totalScore >= passingMarks;
    const nextStatus =
      !hasDescriptive || exam?.status === 'Results Published'
        ? 'published'
        : 'submitted';

    return {
      ...incomingAttempt,
      status: nextStatus,
      submittedAt: incomingAttempt.submittedAt || new Date().toISOString(),
      publishedAt:
        nextStatus === 'published'
          ? incomingAttempt.publishedAt || new Date().toISOString()
          : undefined,
      answers: updatedAnswers,
      mcqScore,
      descriptiveScore,
      codingScore,
      totalScore,
      maxScore,
      percentage,
      passed,
      updatedAtMs: Math.max(Date.now(), Number(incomingAttempt.updatedAtMs || 0) + 1),
    };
  };

  // PDF Question Paper Text Extraction API using Mozilla pdfjs-dist (Admin-only + rate-limited)
  app.post('/api/parse-pdf', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const adminSession = resolveAdminSession(req, true);
      if (!adminSession) {
        res.status(401).json({
          ok: false,
          error: 'Administrator authentication is required to parse question papers.',
        });
        return;
      }

      const limit = pdfParseLimiter.check(getClientIpKey(req));
      if (!limit.allowed) {
        res.setHeader('Retry-After', String(limit.retryAfterSec));
        res.status(429).json({
          ok: false,
          error: 'Too many PDF parsing requests. Please wait a moment and try again.',
        });
        return;
      }

      const base64Pdf = req.body?.base64Pdf;
      if (!base64Pdf || typeof base64Pdf !== 'string') {
        res.status(400).json({ ok: false, error: 'Missing base64Pdf payload' });
        return;
      }

      const cleanBase64 = base64Pdf.replace(/^data:application\/pdf;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      if (buffer.length === 0 || buffer.length > 20 * 1024 * 1024) {
        res.status(413).json({
          ok: false,
          error: 'PDF file exceeds the 20 MB upload limit.',
        });
        return;
      }
      const uint8 = new Uint8Array(buffer);

      const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const loadingTask = pdfjs.getDocument({
        data: uint8,
        useSystemFonts: true,
        disableFontFace: true,
        isEvalSupported: false,
      });
      const pdfDoc = await loadingTask.promise;

      const pageTexts: string[] = [];
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const items: any[] = Array.isArray(textContent?.items)
          ? textContent.items
          : [];

        // Group text items by Y coordinate (within 3.5pt tolerance) and sort X left-to-right
        interface LineBucket {
          y: number;
          parts: Array<{ x: number; str: string }>;
        }
        const buckets: LineBucket[] = [];

        for (const item of items) {
          const rawStr = typeof item?.str === 'string' ? item.str : '';
          if (!rawStr) continue;
          const transform = Array.isArray(item?.transform)
            ? item.transform
            : [1, 0, 0, 1, 0, 0];
          const x = Number(transform[4]) || 0;
          const y = Number(transform[5]) || 0;

          let matchedBucket = buckets.find((b) => Math.abs(b.y - y) <= 3.5);
          if (!matchedBucket) {
            matchedBucket = { y, parts: [] };
            buckets.push(matchedBucket);
          }
          matchedBucket.parts.push({ x, str: rawStr });
        }

        // Sort buckets top-to-bottom (higher Y is higher on PDF page)
        buckets.sort((a, b) => b.y - a.y);

        const lines: string[] = [];
        for (const bucket of buckets) {
          bucket.parts.sort((a, b) => a.x - b.x);
          const lineStr = bucket.parts
            .map((p) => p.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (lineStr && !isCorruptedMojibakeText(lineStr)) {
            lines.push(lineStr);
          }
        }

        if (lines.length > 0) {
          pageTexts.push(lines.join('\n'));
        }
      }

      const fullText = pageTexts.join('\n\n').trim();
      res.json({
        ok: true,
        pageCount: pdfDoc.numPages,
        text: fullText,
      });
    } catch {
      res.status(200).json({
        ok: false,
        text: '',
        error: 'Could not extract readable text from this PDF file.',
      });
    }
  });

  app.get('/api/auth/admin/status', async (_req, res) => {
    try {
      await ensureHydratedIfEmpty();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json(adminAuth.getPublicStatus(getSettingsAdminEmail()));
    } catch {
      res.status(500).json({ ok: false, error: 'Failed to read authentication status.' });
    }
  });

  app.post('/api/auth/admin/setup', async (req, res) => {
    try {
      const limit = adminLoginLimiter.check(`setup:${getClientIpKey(req)}`);
      if (!limit.allowed) {
        res.setHeader('Retry-After', String(limit.retryAfterSec));
        res.status(429).json({
          ok: false,
          error: 'Too many setup attempts. Please wait a few minutes and try again.',
        });
        return;
      }
      await ensureHydratedIfEmpty();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const email = String(req.body?.email || '').trim();
      const password = String(req.body?.password || '');
      const confirmPassword = String(req.body?.confirmPassword || '');
      const result = adminAuth.setupInitialPassword(email, password, confirmPassword);
      if (!result.ok) {
        res.status(400).json({ ok: false, error: result.error });
        return;
      }

      // Keep Admin Settings email synced with the claimed setup email
      if (result.email) {
        const nextState = {
          ...memoryStore.state,
          settings: {
            ...(memoryStore.state.settings || {}),
            adminEmail: result.email,
          },
          settingsUpdatedAt: Date.now(),
        };
        saveServerState({ updatedAt: Date.now(), state: nextState }, true);
      }

      if (result.token) {
        clearStudentSessionCookie(req, res);
        setAdminSessionCookie(req, res, result.token);
      }

      res.json({
        ok: true,
        token: result.token,
        user: {
          id: 'admin-1',
          name: memoryStore.state?.settings?.adminName || 'Administrator',
          email: result.email,
          role: 'admin',
        },
      });
    } catch {
      res.status(500).json({ ok: false, error: 'Initial setup encountered a server error. Please try again.' });
    }
  });

  app.post('/api/auth/admin/login', async (req, res) => {
    try {
      const limit = adminLoginLimiter.check(`admin:${getClientIpKey(req)}`);
      if (!limit.allowed) {
        res.setHeader('Retry-After', String(limit.retryAfterSec));
        res.status(429).json({
          ok: false,
          error: 'Too many login attempts. Please wait a few minutes and try again.',
        });
        return;
      }
      await ensureHydratedIfEmpty();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const identifier = String(req.body?.identifier || '');
      const password = String(req.body?.password || '');
      const result = adminAuth.loginAdmin(
        identifier,
        password,
        getClientIpKey(req),
        getSettingsAdminEmail(),
        getSettingsAdminName()
      );
      if (!result.ok) {
        res.status(result.statusCode || 401).json({ ok: false, error: result.error });
        return;
      }

      if (result.token) {
        clearStudentSessionCookie(req, res);
        setAdminSessionCookie(req, res, result.token);
      }

      res.json({
        ok: true,
        token: result.token,
        user: {
          id: 'admin-1',
          name: memoryStore.state?.settings?.adminName || 'Administrator',
          email: result.email,
          role: 'admin',
        },
      });
    } catch {
      res.status(500).json({ ok: false, error: 'Authentication server encountered an error. Please try again.' });
    }
  });

  app.get('/api/auth/admin/session', async (req, res) => {
    try {
      await ensureHydratedIfEmpty();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const session = resolveAdminSession(req, false);
      if (!session) {
        res.status(200).json({ ok: true, authenticated: false });
        return;
      }
      res.json({
        ok: true,
        authenticated: true,
        email: session.email,
        user: {
          id: 'admin-1',
          name: memoryStore.state?.settings?.adminName || 'Administrator',
          email: session.email,
          role: 'admin',
        },
      });
    } catch {
      res.status(500).json({ ok: false, authenticated: false });
    }
  });

  app.post('/api/auth/admin/logout', (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const hasBearer = Boolean(req.headers.authorization);
      const cookieToken = parseCookieValue(
        req.headers.cookie,
        ADMIN_SESSION_COOKIE
      );
      if (!hasBearer && cookieToken && !verifyCookieCsrf(req)) {
        res.status(403).json({ ok: false, error: 'Cross-site logout request blocked.' });
        return;
      }
      adminAuth.revokeBearerHeader(req.headers.authorization);
      if (cookieToken) {
        adminAuth.revokeToken(cookieToken);
      }
      clearAdminSessionCookie(req, res);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false, error: 'Logout failed.' });
    }
  });

  app.post('/api/auth/admin/password', async (req, res) => {
    try {
      await ensureHydratedIfEmpty();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const verifiedSession = resolveAdminSession(req, true);
      if (!verifiedSession) {
        res.status(401).json({
          ok: false,
          error: 'Your Administrator session has expired. Please sign in again.',
        });
        return;
      }
      const currentPassword = String(req.body?.currentPassword || '');
      const newPassword = String(req.body?.newPassword || '');
      const confirmPassword = String(req.body?.confirmPassword || '');
      const result = adminAuth.changePasswordAuthenticated(
        verifiedSession.token,
        currentPassword,
        newPassword,
        confirmPassword,
        getSettingsAdminEmail()
      );
      if (!result.ok) {
        res.status(result.statusCode || 400).json({ ok: false, error: result.error });
        return;
      }
      if (result.token) {
        setAdminSessionCookie(req, res, result.token);
      }
      res.json({ ok: true, token: result.token });
    } catch {
      res.status(500).json({ ok: false, error: 'Password update failed. Please try again.' });
    }
  });

  app.post('/api/auth/admin/otp/request', async (req, res) => {
    try {
      const limit = otpLimiter.check(`otp-req:${getClientIpKey(req)}`);
      if (!limit.allowed) {
        res.setHeader('Retry-After', String(limit.retryAfterSec));
        res.status(429).json({
          ok: false,
          error: 'Too many OTP requests. Please wait before trying again.',
        });
        return;
      }
      await ensureHydratedIfEmpty();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const email = String(req.body?.email || '').trim();
      const result = await adminAuth.requestOtpViaSmtp(email, getSettingsAdminEmail());
      if (!result.ok) {
        res.status(result.statusCode || 400).json({
          ok: false,
          error: result.error,
          cooldownSeconds: result.cooldownSeconds,
        });
        return;
      }
      res.json({
        ok: true,
        maskedEmail: result.maskedEmail,
        expiresInMinutes: result.expiresInMinutes,
        cooldownSeconds: result.cooldownSeconds,
      });
    } catch {
      res.status(500).json({ ok: false, error: 'Failed to dispatch verification email. Please try again.' });
    }
  });

  app.post('/api/auth/admin/otp/google', async (req, res) => {
    try {
      const limit = otpLimiter.check(`otp-google:${getClientIpKey(req)}`);
      if (!limit.allowed) {
        res.setHeader('Retry-After', String(limit.retryAfterSec));
        res.status(429).json({
          ok: false,
          error: 'Too many verification requests. Please wait before trying again.',
        });
        return;
      }
      await ensureHydratedIfEmpty();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const email = String(req.body?.email || '').trim();
      const accessToken = String(req.body?.accessToken || '').trim();
      const result = await adminAuth.requestOtpViaVerifiedGoogle(
        email,
        accessToken,
        getSettingsAdminEmail()
      );
      if (!result.ok) {
        res.status(result.statusCode || 400).json({
          ok: false,
          error: result.error,
          cooldownSeconds: result.cooldownSeconds,
        });
        return;
      }
      res.json({
        ok: true,
        maskedEmail: result.maskedEmail,
        expiresInMinutes: result.expiresInMinutes,
        cooldownSeconds: result.cooldownSeconds,
      });
    } catch {
      res.status(500).json({ ok: false, error: 'Google verification dispatch failed. Please try again.' });
    }
  });

  app.post('/api/auth/admin/otp/verify', async (req, res) => {
    try {
      const limit = otpLimiter.check(`otp-verify:${getClientIpKey(req)}`);
      if (!limit.allowed) {
        res.setHeader('Retry-After', String(limit.retryAfterSec));
        res.status(429).json({
          ok: false,
          error: 'Too many OTP verification attempts. Please wait before trying again.',
        });
        return;
      }
      await ensureHydratedIfEmpty();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const otp = String(req.body?.otp || '').trim();
      const newPassword = String(req.body?.newPassword || '');
      const confirmPassword = String(req.body?.confirmPassword || '');
      const result = adminAuth.verifyOtpAndResetPassword(
        otp,
        newPassword,
        confirmPassword,
        getSettingsAdminEmail()
      );
      if (!result.ok) {
        res.status(result.statusCode || 400).json({ ok: false, error: result.error });
        return;
      }
      clearAdminSessionCookie(req, res);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false, error: 'Verification failed. Please try again.' });
    }
  });

  // =========================================================
  // SERVER-SIDE STUDENT AUTHENTICATION (SCRYPT + HTTPONLY COOKIE)
  // =========================================================
  app.post('/api/auth/student/login', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const limit = studentLoginLimiter.check(`student:${getClientIpKey(req)}`);
      if (!limit.allowed) {
        res.setHeader('Retry-After', String(limit.retryAfterSec));
        res.status(429).json({
          ok: false,
          error: 'Too many student sign-in attempts. Please wait a few minutes and try again.',
        });
        return;
      }

      await ensureHydratedIfEmpty();
      const cleanId = String(req.body?.identifier || '').trim().toLowerCase();
      const compactId = cleanId.replace(/\s+/g, '');
      const rawPass = String(req.body?.password || '').trim();

      if (!cleanId) {
        res.status(400).json({
          ok: false,
          error: 'Please enter your registered Student ID or Email.',
        });
        return;
      }
      if (!rawPass) {
        res.status(400).json({
          ok: false,
          error: 'Please enter your Student password.',
        });
        return;
      }

      const students: any[] = Array.isArray(memoryStore.state?.students)
        ? memoryStore.state.students
        : [];
      const student = students.find((s: any) => {
        const sid = String(s?.studentId || '').trim().toLowerCase();
        const sEmail = String(s?.email || '').trim().toLowerCase();
        return (
          sid === cleanId ||
          sid.replace(/\s+/g, '') === compactId ||
          sEmail === cleanId
        );
      });

      if (!student) {
        res.status(401).json({
          ok: false,
          error:
            'Student account not found. Please check your Student ID or Email, or contact the Administrator.',
        });
        return;
      }

      if (student.status === 'Inactive') {
        res.status(403).json({
          ok: false,
          error: `Student account ${student.studentId} is currently marked Inactive. Please ask the Administrator to set your status to Active in Student Management.`,
        });
        return;
      }

      const storedSecret = student.passwordHash || student.password;
      const valid = verifyStudentPassword(
        rawPass,
        storedSecret,
        String(student.studentId || '')
      );
      if (!valid) {
        res.status(401).json({
          ok: false,
          error:
            'Invalid Student password. Please enter your assigned password or contact the Administrator.',
        });
        return;
      }

      // Auto-upgrade any legacy plaintext password to salted scrypt on successful login
      if (!isHashedStudentPassword(student.passwordHash)) {
        student.passwordHash = hashStudentPassword(rawPass);
        delete student.password;
        saveServerState(
          { updatedAt: Date.now(), state: memoryStore.state },
          true
        );
      }

      const token = adminAuth.issueStudentSessionToken({
        id: String(student.id),
        studentId: String(student.studentId),
        email: String(student.email || ''),
      });
      clearAdminSessionCookie(req, res);
      setStudentSessionCookie(req, res, token);

      res.json({
        ok: true,
        user: buildStudentUserProfile(student),
      });
    } catch {
      res.status(500).json({
        ok: false,
        error: 'Authentication server encountered an error. Please try again.',
      });
    }
  });

  app.get('/api/auth/student/session', async (req, res) => {
    try {
      await ensureHydratedIfEmpty();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const session = resolveStudentSession(req, false);
      if (!session) {
        res.status(200).json({ ok: true, authenticated: false });
        return;
      }
      const student = findCanonicalStudent(
        memoryStore.state?.students,
        session.id,
        session.studentId
      );
      if (!student || student.status === 'Inactive') {
        clearStudentSessionCookie(req, res);
        res.status(200).json({ ok: true, authenticated: false });
        return;
      }
      res.status(200).json({
        ok: true,
        authenticated: true,
        user: buildStudentUserProfile(student),
      });
    } catch {
      res.status(500).json({ ok: false, authenticated: false });
    }
  });

  app.post('/api/auth/student/logout', (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const cookieToken = parseCookieValue(
        req.headers.cookie,
        STUDENT_SESSION_COOKIE
      );
      if (cookieToken && !verifyCookieCsrf(req)) {
        res.status(403).json({ ok: false, error: 'Cross-site logout request blocked.' });
        return;
      }
      if (cookieToken) {
        adminAuth.revokeStudentSessionToken(cookieToken);
      }
      clearStudentSessionCookie(req, res);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false, error: 'Logout failed.' });
    }
  });

  // Serve extracted institution logo/asset images safely with strict filename allowlist
  app.get('/api/assets/:filename', (req, res) => {
    const filename = String(req.params.filename || '').trim();
    const match = filename.match(/^[a-zA-Z0-9_-]+\.(png|jpe?g|webp|gif|svg)$/i);
    if (!match) {
      res.status(400).json({ error: 'Invalid asset filename' });
      return;
    }
    const ext = match[1].toLowerCase();
    const mimeType = ASSET_EXT_TO_MIME[ext] || 'application/octet-stream';
    const dataCandidate = path.join(DATA_ASSETS_DIR, filename);
    const publicCandidate = path.join(PUBLIC_ASSETS_DIR, filename);
    const distCandidate = path.join(__dirname, 'dist', 'assets', filename);
    const targetPath = fs.existsSync(dataCandidate)
      ? dataCandidate
      : fs.existsSync(publicCandidate)
      ? publicCandidate
      : fs.existsSync(distCandidate)
      ? distCandidate
      : null;

    if (!targetPath) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(targetPath);
  });

  // Serve official Panimalar crest for browsers requesting /favicon.ico directly
  app.get('/favicon.ico', (_req, res) => {
    const publicCrest = path.join(PUBLIC_ASSETS_DIR, 'panimalar-crest.png');
    const distCrest = path.join(__dirname, 'dist', 'assets', 'panimalar-crest.png');
    const targetPath = fs.existsSync(publicCrest)
      ? publicCrest
      : fs.existsSync(distCrest)
      ? distCrest
      : null;
    if (!targetPath) {
      res.status(204).end();
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(targetPath);
  });

  // Minimal Health Check API (no internal server diagnostics or file metadata)
  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ ok: true });
  });

  const applyServerTimedAutoPublish = () => {
    const st = memoryStore.state;
    if (!st || !Array.isArray(st.exams) || st.exams.length === 0) return;
    const nowMs = Date.now();
    let changed = false;
    const publishedExamIds = new Set<string>();
    const nextExams = st.exams.map((exam: any) => {
      if (
        exam?.autoPublishAt &&
        exam?.status !== 'Results Published' &&
        new Date(exam.autoPublishAt).getTime() <= nowMs
      ) {
        changed = true;
        publishedExamIds.add(String(exam.id));
        return { ...exam, status: 'Results Published', updatedAtMs: nowMs };
      }
      return exam;
    });
    if (!changed) return;
    const nextAttempts = Array.isArray(st.attempts)
      ? st.attempts.map((a: any) =>
          publishedExamIds.has(String(a?.examId)) && a?.status !== 'in-progress'
            ? {
                ...a,
                status: 'published',
                publishedAt: a.publishedAt || new Date(nowMs).toISOString(),
                updatedAtMs: Math.max(nowMs, Number(a.updatedAtMs || 0) + 1),
              }
            : a
        )
      : [];
    saveServerState(
      {
        updatedAt: nowMs,
        state: { ...st, exams: nextExams, attempts: nextAttempts },
      },
      true
    );
  };

  // Role-Scoped Live Shared State API
  app.get('/api/state', async (req, res) => {
    try {
      await ensureHydratedIfEmpty();
      applyServerTimedAutoPublish();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

      const adminSession = resolveAdminSession(req, false);
      if (adminSession) {
        res.json(buildAdminStateView(memoryStore));
        return;
      }

      const studentSession = resolveStudentSession(req, false);
      if (studentSession) {
        const student = findCanonicalStudent(
          memoryStore.state?.students,
          studentSession.id,
          studentSession.studentId
        );
        if (student && student.status !== 'Inactive') {
          res.json(buildStudentStateView(memoryStore, student));
          return;
        }
      }

      res.json(buildPublicStateView(memoryStore));
    } catch {
      res.status(500).json({ ok: false, error: 'Failed to load shared state.' });
    }
  });

  app.post('/api/state/sync', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const limit = syncLimiter.check(`sync:${getClientIpKey(req)}`);
      if (!limit.allowed) {
        res.setHeader('Retry-After', String(limit.retryAfterSec));
        res.status(429).json({
          ok: false,
          error: 'Too many sync requests. Please pause briefly and try again.',
        });
        return;
      }

      await ensureHydratedIfEmpty();
      const incomingState = req.body?.state;
      const replaceAll = Boolean(req.body?.replaceAll);
      const requestedRole: 'admin' | 'student' | 'anonymous' =
        req.body?.role === 'admin'
          ? 'admin'
          : req.body?.role === 'student'
          ? 'student'
          : 'anonymous';

      if (requestedRole === 'admin' || replaceAll) {
        const verifiedAdmin = resolveAdminSession(req, true);
        if (!verifiedAdmin) {
          res.status(401).json({
            ok: false,
            error:
              'Unauthorized Administrator mutation. Please sign in with valid Admin credentials.',
          });
          return;
        }

        if (incomingState && typeof incomingState === 'object') {
          let nextState: Record<string, any>;
          if (replaceAll) {
            // Preserve existing student password hashes for students edited without a new password
            const prevStudents: any[] = Array.isArray(memoryStore.state?.students)
              ? memoryStore.state.students
              : [];
            const incomingStudents: any[] = Array.isArray(incomingState.students)
              ? incomingState.students.map((stu: any) => {
                  if (
                    (typeof stu?.password === 'string' && stu.password.trim()) ||
                    (typeof stu?.passwordHash === 'string' && stu.passwordHash.trim())
                  ) {
                    return stu;
                  }
                  const prevMatch = findCanonicalStudent(
                    prevStudents,
                    stu?.id,
                    stu?.studentId
                  );
                  return prevMatch?.passwordHash
                    ? { ...stu, passwordHash: prevMatch.passwordHash }
                    : stu;
                })
              : [];
            nextState = { ...incomingState, students: incomingStudents };
          } else {
            nextState = mergeServerStates(
              memoryStore.state,
              incomingState,
              'admin'
            );
          }

          if (typeof nextState?.settings?.adminEmail === 'string') {
            adminAuth.syncRecoveryEmail(nextState.settings.adminEmail);
          }

          saveServerState({ updatedAt: Date.now(), state: nextState }, true);
        }

        res.json(buildAdminStateView(memoryStore));
        return;
      }

      if (requestedRole === 'student') {
        const verifiedStudent = resolveStudentSession(req, true);
        if (!verifiedStudent) {
          res.status(401).json({
            ok: false,
            error: 'Unauthorized Student sync. Please sign in again.',
          });
          return;
        }

        const canonicalStudent = findCanonicalStudent(
          memoryStore.state?.students,
          verifiedStudent.id,
          verifiedStudent.studentId
        );
        if (!canonicalStudent || canonicalStudent.status === 'Inactive') {
          res.status(401).json({
            ok: false,
            error: 'Student account is no longer active. Please sign in again.',
          });
          return;
        }

        if (incomingState && typeof incomingState === 'object') {
          const verifiedId = String(canonicalStudent.id);
          const nextState: Record<string, any> = { ...memoryStore.state };

          // 1. Allow student to update ONLY their own editable contact/bio profile fields
          if (Array.isArray(incomingState.students)) {
            const selfPatch = incomingState.students.find(
              (s: any) => String(s?.id || '') === verifiedId
            );
            if (selfPatch && typeof selfPatch === 'object') {
              const allowedFields = [
                'phone',
                'dateOfBirth',
                'gender',
                'cgpa',
                'address',
                'city',
                'guardianName',
                'guardianPhone',
                'linkedinUrl',
                'githubUrl',
                'skills',
                'bio',
              ] as const;
              const patchObj: Record<string, any> = {};
              for (const field of allowedFields) {
                if (selfPatch[field] !== undefined) {
                  patchObj[field] = selfPatch[field];
                }
              }
              if (Object.keys(patchObj).length > 0) {
                nextState.students = (nextState.students || []).map((s: any) =>
                  String(s?.id || '') === verifiedId
                    ? {
                        ...s,
                        ...patchObj,
                        updatedAtMs: Math.max(
                          Date.now(),
                          Number(selfPatch.updatedAtMs || 0)
                        ),
                      }
                    : s
                );
              }
            }
          }

          // 2. Allow student to create/update ONLY their own exam attempts with server-authoritative grading
          const existingAttempts: any[] = Array.isArray(nextState.attempts)
            ? nextState.attempts
            : [];
          const existingCertificates: any[] = Array.isArray(nextState.certificates)
            ? [...nextState.certificates]
            : [];
          const incomingOwnAttempts: any[] = Array.isArray(incomingState.attempts)
            ? incomingState.attempts
                .filter((a: any) => String(a?.studentId || '') === verifiedId)
                .map((att: any) => {
                  const prev = existingAttempts.find(
                    (e: any) => String(e?.id || '') === String(att?.id || '')
                  );
                  return gradeStudentAttemptAuthoritatively(
                    {
                      ...att,
                      studentId: verifiedId,
                      studentName: canonicalStudent.name,
                      studentRegId: canonicalStudent.studentId,
                      studentEmail: canonicalStudent.email,
                    },
                    prev,
                    nextState
                  );
                })
            : [];

          if (incomingOwnAttempts.length > 0) {
            const deletedSet = new Set<string>(
              Array.isArray(nextState.deletedIds) ? nextState.deletedIds : []
            );
            nextState.attempts = mergeArrayById(
              existingAttempts,
              incomingOwnAttempts,
              deletedSet,
              false,
              true
            );

            // Auto-issue merit certificate on the server for any passed graded attempt
            for (const att of incomingOwnAttempts) {
              if (
                att.passed &&
                (att.status === 'submitted' || att.status === 'published') &&
                !existingCertificates.some((c: any) => c?.attemptId === att.id)
              ) {
                const grade =
                  att.percentage >= 90
                    ? 'A+ (Distinction)'
                    : att.percentage >= 80
                    ? 'A (First Class)'
                    : att.percentage >= 70
                    ? 'B+ (Merit)'
                    : 'B (Pass)';
                existingCertificates.push({
                  id: `cert-auto-${att.id}`,
                  certificateNumber: `EF-2026-${String(att.subjectName || 'EXM')
                    .slice(0, 3)
                    .toUpperCase()}-${String(existingCertificates.length + 1).padStart(3, '0')}`,
                  attemptId: att.id,
                  examId: att.examId,
                  examTitle: att.examTitle,
                  subjectName: att.subjectName,
                  studentId: verifiedId,
                  studentName: canonicalStudent.name,
                  studentRegId: canonicalStudent.studentId,
                  section: normalizeServerSection(canonicalStudent.section),
                  score: att.totalScore,
                  maxScore: att.maxScore,
                  percentage: att.percentage,
                  grade,
                  issuedAt: (att.submittedAt || new Date().toISOString()).split('T')[0],
                  publishedToStudent: true,
                  customRemarks:
                    'Awarded for passing the proctored examination with verified distinction.',
                  updatedAtMs: Date.now(),
                });
              }
            }
            nextState.certificates = existingCertificates;
          }

          // 3. Allow student to log ONLY their own proctoring violations
          if (Array.isArray(incomingState.violations)) {
            const ownViolations = incomingState.violations
              .filter((v: any) => String(v?.studentId || '') === verifiedId)
              .map((v: any) => ({
                ...v,
                studentId: verifiedId,
                studentName: canonicalStudent.name,
                studentRegId: canonicalStudent.studentId,
                details: sanitizeText(String(v?.details || ''), 500),
              }));
            if (ownViolations.length > 0) {
              const deletedSet = new Set<string>(
                Array.isArray(nextState.deletedIds) ? nextState.deletedIds : []
              );
              nextState.violations = mergeArrayById(
                nextState.violations || [],
                ownViolations,
                deletedSet
              );
            }
          }

          saveServerState({ updatedAt: Date.now(), state: nextState }, true);
        }

        const refreshedStudent =
          findCanonicalStudent(
            memoryStore.state?.students,
            verifiedStudent.id,
            verifiedStudent.studentId
          ) || canonicalStudent;
        res.json(buildStudentStateView(memoryStore, refreshedStudent));
        return;
      }

      res.status(401).json({
        ok: false,
        error: 'Authentication is required to synchronize platform state.',
      });
    } catch (err) {
      console.error('[ExamFlow] Sync error:', err);
      res.status(500).json({ ok: false, error: 'Failed to synchronize state.' });
    }
  });

  // Always return safe JSON for API parsing/body errors instead of HTML error pages or stack traces
  app.use(
    '/api',
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const status = Number(err?.status || err?.statusCode || 500);
      const safeStatus = status >= 400 && status < 600 ? status : 500;
      if (safeStatus >= 500) {
        console.error('[ExamFlow] API error:', err);
      }
      res.status(safeStatus).json({
        ok: false,
        error:
          safeStatus >= 500
            ? 'An unexpected server error occurred. Please try again.'
            : safeStatus === 413
            ? 'Request payload is too large.'
            : 'Invalid API request.',
      });
    }
  );

  const distPath = path.join(__dirname, 'dist');
  const isTsxDev = process.execArgv.some((arg) => arg.includes('tsx'));
  const isProd =
    process.env.NODE_ENV === 'production' ||
    (!isTsxDev && fs.existsSync(path.join(distPath, 'index.html')));

  if (isProd && fs.existsSync(path.join(distPath, 'index.html'))) {
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );
    app.use(express.static(distPath, { maxAge: '1h' }));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // Allow browser disk-caching of Vite's content-hashed prebundled deps (?v=...) across page reloads
    app.use('/node_modules/.vite/deps', (req, res, next) => {
      if (req.query?.v) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      next();
    });
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ExamFlow server running on http://0.0.0.0:${PORT} (prod=${isProd})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
