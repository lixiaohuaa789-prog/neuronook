import {
  fromLegacySrsStep,
  normalizeNextReviewTime,
  normalizeStatus,
  normalizeStep,
  toLegacySrsStep,
  transitionReviewState,
  type MemoryStatus,
  type ReviewFeedback,
  type SrsStep,
} from "./srs";

const KEY = "study_app_data";

function emptyDB(): StudyDB {
  return { notes: [], reviews: [], pomodoros: [], checkins: [], reviewLogs: [], folders: [], tombstones: [] };
}

export type Note = {
  id: number;
  front: string;
  content: string;
  subject: string;
  created_at: string;
  status: MemoryStatus;
  step: number;
  nextReviewTime: number;
  difficulty?: "easy" | "normal" | "hard"; // 难度标签，影响复习时间
  
  // 新增：科学化知识点结构（基于主动回忆 + 间隔重复）
  question?: string; // 核心问题
  coreAnswer?: string; // 核心答案（最必须记住的）
  keyPoints?: string[]; // 关键点列表
  keywords?: string[]; // 手动提取的关键词泡泡
  commonMistakes?: string; // 易错点 / 常见误区
  examples?: string; // 示例/应用场景
  images?: string[]; // 图片URLs
  updatedAt?: number;
};

export type FolderNode = {
  id: string;
  title: string;
  children: FolderNode[];
  linkedNoteIds: number[];
};

export type FolderTree = {
  id: string;
  name: string;
  created_at: string;
  nodes: FolderNode[];
  updatedAt?: number;
};

export type Tombstone = {
  entityId: string;
  entityType: "note" | "folder" | "folder-node";
  deletedAt: number;
};

export type Review = {
  note_id: number;
  status: MemoryStatus;
  step: number;
  nextReviewTime: number;
  // 兼容层：旧页面仍在读取这两个字段
  srsStep: SrsStep;
  next_review: string | null;
};

export type ReviewLog = {
  id: number;
  note_id: number;
  review_date: string; // YYYY-MM-DD（本地日）
  remembered: boolean;
  fromStep: SrsStep;
};

export type LearningMetrics = {
  familiarity: number; // 0..1
  priority: number; // 0..1
  overdueRatio: number; // >= 0
  errorRate: number; // 0..1
  reviewCount: number;
  errorCount: number;
  lastReviewTime: number | null;
  intervalMs: number;
};

export type StudyDB = {
  notes: Note[];
  reviews: Review[];
  pomodoros: unknown[];
  checkins: string[];
  reviewLogs: ReviewLog[];
  folders: FolderTree[];
  tombstones: Tombstone[];
};

export type NewNoteInput = Omit<
  Note,
  "id" | "created_at" | "status" | "step" | "nextReviewTime" | "updatedAt"
>;

export type BackupPayload = {
  version: 1 | 2;
  exportedAt: string;
  meta?: {
    schemaVersion: 2;
    stats: {
      noteCount: number;
      reviewCount: number;
      totalBytesize: number;
    };
  };
  db: StudyDB;
};

export type RestoreMode = "overwrite" | "merge";

function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ensureCheckins(db: StudyDB) {
  if (!Array.isArray(db.checkins)) db.checkins = [];
}

function syncLegacyReviewFields(review: Review) {
  review.srsStep = toLegacySrsStep(review.status, review.step);
  review.next_review = new Date(review.nextReviewTime).toISOString();
}

function syncNoteStateFromReview(note: Note, review: Review) {
  note.status = review.status;
  note.step = review.step;
  note.nextReviewTime = review.nextReviewTime;
}

function migrateParsed(raw: unknown): StudyDB {
  if (!raw || typeof raw !== "object") {
    return { notes: [], reviews: [], pomodoros: [], checkins: [], reviewLogs: [], folders: [], tombstones: [] };
  }
  const db = raw as Record<string, unknown>;
  const notes = Array.isArray(db.notes) ? db.notes : [];
  const reviews = Array.isArray(db.reviews) ? db.reviews : [];
  const pomodoros = Array.isArray(db.pomodoros) ? db.pomodoros : [];
  const checkins = Array.isArray(db.checkins) ? db.checkins : [];
  const reviewLogs = Array.isArray(db.reviewLogs) ? db.reviewLogs : [];
  const folders = Array.isArray(db.folders) ? db.folders : [];
  const tombstones = Array.isArray(db.tombstones) ? db.tombstones : [];

  for (const n of notes as Record<string, unknown>[]) {
    if (n.front == null) {
      const content = typeof n.content === "string" ? n.content : "";
      const firstLine = content.split(/\r?\n/)[0]?.trim() ?? "";
      const derived =
        firstLine || content.slice(0, 48).trim() || "未命名";
      n.front = derived;
    }
    if (n.subject == null) n.subject = "未分类";
    if (n.created_at == null) n.created_at = new Date().toISOString();
    if (n.content == null) n.content = "";
    if (n.updatedAt == null) n.updatedAt = new Date(n.created_at as string).getTime() || Date.now();
    if (!Array.isArray(n.keywords)) n.keywords = [];

    // 双引擎状态字段兜底
    n.status = normalizeStatus(n.status);
    n.step = normalizeStep(n.step);
    n.nextReviewTime = normalizeNextReviewTime(
      n.nextReviewTime,
      Date.now()
    );
    
    // 向后兼容：初始化新字段（如果不存在）
    if (n.question == null && n.front) {
      n.question = n.front; // 从front字段推导
    }
    if (n.coreAnswer == null && n.content) {
      n.coreAnswer = n.content; // 从content字段推导
    }
    // 其他新字段保持undefined，符合可选字段的设计
  }

  for (const r of reviews as Record<string, unknown>[]) {
    const legacyStepRaw =
      r.srsStep ?? r.stage ?? (typeof r.step === "number" ? (Number(r.step) >= 4 ? 5 : Number(r.step) + 1) : 1);
    const legacyStep = Math.max(1, Math.min(5, Math.floor(Number(legacyStepRaw) || 1)));
    const legacyState = fromLegacySrsStep(legacyStep);

    r.status = normalizeStatus(r.status ?? legacyState.status);
    r.step = normalizeStep(r.step ?? legacyState.step);
    r.nextReviewTime = normalizeNextReviewTime(
      r.nextReviewTime ?? r.next_review,
      Date.now()
    );
    r.srsStep = toLegacySrsStep(r.status as MemoryStatus, r.step as number);
    r.next_review = new Date(r.nextReviewTime as number).toISOString();
    delete r.stage;
  }

  // 同步 note 的状态字段，确保新旧数据都能读取
  const reviewByNoteId = new Map<number, Record<string, unknown>>();
  for (const r of reviews as Record<string, unknown>[]) {
    const noteId = typeof r.note_id === "number" ? r.note_id : Number(r.note_id);
    if (Number.isFinite(noteId)) {
      reviewByNoteId.set(noteId, r);
    }
  }
  for (const n of notes as Record<string, unknown>[]) {
    const noteId = typeof n.id === "number" ? n.id : Number(n.id);
    const r = reviewByNoteId.get(noteId);
    if (!r) continue;
    n.status = normalizeStatus(r.status);
    n.step = normalizeStep(r.step);
    n.nextReviewTime = normalizeNextReviewTime(r.nextReviewTime, Date.now());
  }

  for (const f of folders as Record<string, unknown>[]) {
    if (f.id == null) f.id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (f.name == null) f.name = "未命名文件夹";
    if (f.created_at == null) f.created_at = new Date().toISOString();
    if (!Array.isArray(f.nodes)) f.nodes = [];
    if (f.updatedAt == null) f.updatedAt = new Date(f.created_at as string).getTime() || Date.now();
  }

  const normalizedTombstones: Tombstone[] = [];
  for (const t of tombstones as Record<string, unknown>[]) {
    const entityId = typeof t.entityId === "string" ? t.entityId : String(t.entityId ?? "");
    const entityType = t.entityType === "folder" || t.entityType === "folder-node" ? t.entityType : "note";
    const deletedAt = typeof t.deletedAt === "number" ? t.deletedAt : Date.now();
    if (!entityId) continue;
    normalizedTombstones.push({ entityId, entityType, deletedAt });
  }

  return { notes, reviews, pomodoros, checkins, reviewLogs, folders, tombstones: normalizedTombstones } as StudyDB;
}

export function getDB(): StudyDB | null {
  if (typeof window === "undefined") return null;
  const data = localStorage.getItem(KEY);
  const parsed = data
    ? JSON.parse(data)
    : emptyDB();
  return migrateParsed(parsed);
}

export function saveDB(db: StudyDB) {
  localStorage.setItem(KEY, JSON.stringify(db));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("study-app-changed"));
  }
}

export function buildBackupPayload(): BackupPayload {
  const db = getDB() ?? emptyDB();
  const totalBytesize = new Blob([JSON.stringify(db)]).size;
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    meta: {
      schemaVersion: 2,
      stats: {
        noteCount: db.notes.length,
        reviewCount: db.reviews.length,
        totalBytesize,
      },
    },
    db,
  };
}

function noteUpdatedAt(note: Note): number {
  if (typeof note.updatedAt === "number") return note.updatedAt;
  const created = new Date(note.created_at).getTime();
  return Number.isFinite(created) ? created : 0;
}

function folderUpdatedAt(folder: FolderTree): number {
  if (typeof folder.updatedAt === "number") return folder.updatedAt;
  const created = new Date(folder.created_at).getTime();
  return Number.isFinite(created) ? created : 0;
}

function mergeTombstones(base: Tombstone[], incoming: Tombstone[]): Tombstone[] {
  const map = new Map<string, Tombstone>();
  for (const t of [...base, ...incoming]) {
    const key = `${t.entityType}:${t.entityId}`;
    const prev = map.get(key);
    if (!prev || t.deletedAt > prev.deletedAt) {
      map.set(key, t);
    }
  }
  return Array.from(map.values());
}

function buildDeletedSet(tombstones: Tombstone[]): Set<string> {
  const set = new Set<string>();
  for (const t of tombstones) set.add(`${t.entityType}:${t.entityId}`);
  return set;
}

function mergePomodoros(base: unknown[], incoming: unknown[]): unknown[] {
  const dateMap = new Map<string, { date: string; pomodoroCount: number }>();
  const fallback: unknown[] = [];
  const fallbackSeen = new Set<string>();

  for (const item of [...base, ...incoming]) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).date === "string" &&
      typeof (item as Record<string, unknown>).pomodoroCount === "number"
    ) {
      const obj = item as { date: string; pomodoroCount: number };
      const prev = dateMap.get(obj.date);
      if (!prev || obj.pomodoroCount > prev.pomodoroCount) {
        dateMap.set(obj.date, obj);
      }
      continue;
    }

    const key = JSON.stringify(item);
    if (fallbackSeen.has(key)) continue;
    fallbackSeen.add(key);
    fallback.push(item);
  }

  return [...Array.from(dateMap.values()), ...fallback];
}

function mergeDB(base: StudyDB, incoming: StudyDB): StudyDB {
  const tombstones = mergeTombstones(base.tombstones, incoming.tombstones);
  const deletedSet = buildDeletedSet(tombstones);

  const notesMap = new Map<number, Note>();
  for (const note of [...base.notes, ...incoming.notes]) {
    if (deletedSet.has(`note:${String(note.id)}`)) continue;
    const prev = notesMap.get(note.id);
    if (!prev || noteUpdatedAt(note) >= noteUpdatedAt(prev)) {
      notesMap.set(note.id, note);
    }
  }

  const reviewsMap = new Map<number, Review>();
  for (const review of [...base.reviews, ...incoming.reviews]) {
    if (deletedSet.has(`note:${String(review.note_id)}`)) continue;
    reviewsMap.set(review.note_id, review);
  }

  const checkins = Array.from(new Set([...base.checkins, ...incoming.checkins]));

  const reviewLogsMap = new Map<number, ReviewLog>();
  for (const log of [...base.reviewLogs, ...incoming.reviewLogs]) {
    if (deletedSet.has(`note:${String(log.note_id)}`)) continue;
    reviewLogsMap.set(log.id, log);
  }

  const folderMap = new Map<string, FolderTree>();
  for (const folder of [...base.folders, ...incoming.folders]) {
    if (deletedSet.has(`folder:${folder.id}`)) continue;
    const prev = folderMap.get(folder.id);
    if (!prev || folderUpdatedAt(folder) >= folderUpdatedAt(prev)) {
      folderMap.set(folder.id, folder);
    }
  }

  const pomodoros = mergePomodoros(base.pomodoros, incoming.pomodoros);

  return {
    notes: Array.from(notesMap.values()),
    reviews: Array.from(reviewsMap.values()),
    pomodoros,
    checkins,
    reviewLogs: Array.from(reviewLogsMap.values()),
    folders: Array.from(folderMap.values()),
    tombstones,
  };
}

export function restoreFromBackupPayload(payload: BackupPayload, mode: RestoreMode = "overwrite") {
  const incoming = migrateParsed(payload.db);
  const current = getDB() ?? emptyDB();
  const next = mode === "overwrite" ? incoming : mergeDB(current, incoming);
  saveDB(next);

  return {
    notes: next.notes.length,
    reviews: next.reviews.length,
    checkins: next.checkins.length,
  };
}

export function getLocalDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function touchDailyCheckin(db: StudyDB) {
  ensureCheckins(db);
  const key = localDateKey();
  if (!db.checkins.includes(key)) db.checkins.push(key);
}

function pushTombstone(db: StudyDB, entityType: Tombstone["entityType"], entityId: string) {
  const now = Date.now();
  const key = `${entityType}:${entityId}`;
  const idx = db.tombstones.findIndex((t) => `${t.entityType}:${t.entityId}` === key);
  if (idx >= 0) {
    db.tombstones[idx] = { ...db.tombstones[idx], deletedAt: now };
    return;
  }
  db.tombstones.push({ entityType, entityId, deletedAt: now });
}

export function addNote(note: NewNoteInput): Note {
  const db = getDB()!;
  const nowMs = Date.now();
  const full: Note = {
    ...note,
    id: Date.now(),
    created_at: new Date().toISOString(),
    updatedAt: Date.now(),
    status: "learning",
    step: 0,
    nextReviewTime: nowMs,
  };
  db.notes.push(full);
  const review: Review = {
    note_id: full.id,
    status: "learning",
    step: 0,
    nextReviewTime: nowMs, // ✅ 新建笔记立即加入复习队列（第一次复习应该现在做）
    srsStep: 1,
    next_review: null,
  };
  syncLegacyReviewFields(review);
  db.reviews.push(review);
  saveDB(db);
  return full;
}

export function getTodayReviews(): Review[] {
  const db = getDB();
  if (!db) return [];
  const nowMs = Date.now();
  return db.reviews.filter((r) => r.nextReviewTime <= nowMs);
}

export type ReviewQueueItem = Review & { note: Note; metrics?: LearningMetrics };

const MIN_INTERVAL_MS = 5 * 60 * 1000;
const MAX_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function parseLocalDateKeyToMs(value: string | undefined): number {
  if (!value) return 0;
  const t = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(t) ? t : 0;
}

function estimateLastReviewTime(logs: ReviewLog[]): number | null {
  if (logs.length === 0) return null;
  let latest = 0;
  for (const log of logs) {
    const fromId = Number(log.id);
    const fromDate = parseLocalDateKeyToMs(log.review_date);
    const ts = Math.max(fromId, fromDate);
    if (ts > latest) latest = ts;
  }
  return latest > 0 ? latest : null;
}

function inferDefaultAccuracy(status: MemoryStatus): number {
  if (status === "graduated") return 0.92;
  if (status === "reviewing") return 0.72;
  return 0.5;
}

function computeLearningMetrics(review: Review, logs: ReviewLog[], nowMs: number): LearningMetrics {
  const reviewCount = logs.length;
  const errorCount = logs.filter((l) => !l.remembered).length;
  const errorRate = reviewCount > 0 ? clamp01(errorCount / reviewCount) : clamp01(1 - inferDefaultAccuracy(review.status));
  const accuracy = clamp01(1 - errorRate);

  const stepRatio = clamp01((review.srsStep - 1) / 4);
  const lastReviewTime = estimateLastReviewTime(logs);
  const intervalCandidate = lastReviewTime != null ? review.nextReviewTime - lastReviewTime : review.nextReviewTime - nowMs;
  const intervalMs = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Number.isFinite(intervalCandidate) ? intervalCandidate : MIN_INTERVAL_MS));

  const elapsed = Math.max(0, nowMs - (lastReviewTime ?? nowMs));
  const decay = clamp01(Math.exp(-elapsed / intervalMs));

  const familiarity = clamp01(0.4 * stepRatio + 0.3 * accuracy + 0.3 * decay);
  const overdueRatio = Math.max(0, (nowMs - review.nextReviewTime) / intervalMs);
  const priority = clamp01((1 - familiarity) * 0.5 + Math.min(1, overdueRatio) * 0.3 + errorRate * 0.2);

  return {
    familiarity,
    priority,
    overdueRatio,
    errorRate,
    reviewCount,
    errorCount,
    lastReviewTime,
    intervalMs,
  };
}

function buildNoteLogsMap(reviewLogs: ReviewLog[]): Map<number, ReviewLog[]> {
  const map = new Map<number, ReviewLog[]>();
  for (const log of reviewLogs) {
    const arr = map.get(log.note_id);
    if (arr) arr.push(log);
    else map.set(log.note_id, [log]);
  }
  return map;
}

export function getReviewQueue(): ReviewQueueItem[] {
  const db = getDB();
  if (!db) return [];
  const nowMs = Date.now();
  const logsMap = buildNoteLogsMap(db.reviewLogs);
  const due = getTodayReviews();
  const out: Array<ReviewQueueItem & { metrics: LearningMetrics }> = [];
  for (const r of due) {
    const note = db.notes.find((n) => n.id === r.note_id);
    if (!note) continue;
    const metrics = computeLearningMetrics(r, logsMap.get(r.note_id) ?? [], nowMs);
    out.push({ ...r, note, metrics });
  }
  out.sort((a, b) => {
    if (b.metrics.priority !== a.metrics.priority) return b.metrics.priority - a.metrics.priority;
    if (b.metrics.overdueRatio !== a.metrics.overdueRatio) return b.metrics.overdueRatio - a.metrics.overdueRatio;
    return a.nextReviewTime - b.nextReviewTime;
  });
  return out;
}

function normalizeFeedback(feedback: ReviewFeedback | boolean): ReviewFeedback {
  if (feedback === true) return "easy";
  if (feedback === false) return "forgot";
  return feedback;
}

export function submitReview(noteId: number, feedback: ReviewFeedback | boolean) {
  const db = getDB();
  if (!db) return;
  const r = db.reviews.find((x) => x.note_id === noteId);
  if (!r) return;
  const note = db.notes.find((n) => n.id === noteId);
  const fromStep = r.srsStep;
  const review_date = localDateKey();
  const nowMs = Date.now();
  const normalizedFeedback = normalizeFeedback(feedback);

  const next = transitionReviewState(
    {
      status: normalizeStatus(r.status),
      step: normalizeStep(r.step),
    },
    normalizedFeedback,
    nowMs
  );

  r.status = next.status;
  r.step = next.step;
  r.nextReviewTime = next.nextReviewTime;
  syncLegacyReviewFields(r);
  if (note) {
    syncNoteStateFromReview(note, r);
  }

  db.reviewLogs.push({
    id: Date.now(),
    note_id: noteId,
    review_date,
    remembered: normalizedFeedback === "easy",
    fromStep,
  });
  touchDailyCheckin(db);
  saveDB(db);
}

export function checkInToday(): boolean {
  const db = getDB()!;
  ensureCheckins(db);
  const key = localDateKey();
  if (db.checkins.includes(key)) return false;
  db.checkins.push(key);
  saveDB(db);
  return true;
}

export function hasCheckedInToday(): boolean {
  const db = getDB();
  if (!db) return false;
  ensureCheckins(db);
  return db.checkins.includes(localDateKey());
}

export function getCheckins(): string[] {
  const db = getDB();
  if (!db) return [];
  ensureCheckins(db);
  return [...db.checkins].sort();
}

export function getStreak(): number {
  const db = getDB();
  if (!db) return 0;
  ensureCheckins(db);
  const set = new Set(db.checkins);
  let d = new Date();
  d.setHours(0, 0, 0, 0);
  if (!set.has(localDateKey(d))) {
    d.setDate(d.getDate() - 1);
  }
  let streak = 0;
  while (set.has(localDateKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function getStudyStats(): {
  noteCount: number;
  dueCount: number;
  streak: number;
  masteredCount: number;
} {
  const db = getDB();
  if (!db) {
    return { noteCount: 0, dueCount: 0, streak: 0, masteredCount: 0 };
  }
  ensureCheckins(db);
  return {
    noteCount: db.notes.length,
    dueCount: getReviewQueue().length,
    streak: getStreak(),
    masteredCount: db.reviews.filter((r) => r.status === "graduated").length,
  };
}

export function getAllNotes(): Note[] {
  const db = getDB();
  if (!db) return [];
  return db.notes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function deleteNote(noteId: number) {
  const db = getDB();
  if (!db) return;
  
  // 删除笔记
  db.notes = db.notes.filter((n) => n.id !== noteId);
  
  // 删除对应的复习记录
  db.reviews = db.reviews.filter((r) => r.note_id !== noteId);
  
  // 删除对应的复习日志
  db.reviewLogs = db.reviewLogs.filter((l) => l.note_id !== noteId);
  pushTombstone(db, "note", String(noteId));
  
  saveDB(db);
}

export function updateNote(noteId: number, data: NewNoteInput): Note | null {
  const db = getDB();
  if (!db) return null;

  const note = db.notes.find((n) => n.id === noteId);
  if (!note) return null;

  const nextFront = data.front?.trim() || data.question?.trim() || note.front || "未命名";
  const nextContent = data.content?.trim() || data.coreAnswer?.trim() || note.content || "";
  const nextSubject = data.subject?.trim() || note.subject || "未分类";

  note.front = nextFront;
  note.content = nextContent;
  note.subject = nextSubject;
  note.difficulty = data.difficulty ?? note.difficulty;
  note.question = data.question?.trim() || nextFront;
  note.coreAnswer = data.coreAnswer?.trim() || nextContent;
  note.keyPoints = data.keyPoints && data.keyPoints.length > 0 ? data.keyPoints : undefined;
  note.keywords = data.keywords && data.keywords.length > 0 ? data.keywords : undefined;
  note.commonMistakes = data.commonMistakes?.trim() || undefined;
  note.examples = data.examples?.trim() || undefined;
  note.images = data.images && data.images.length > 0 ? data.images : undefined;
  note.updatedAt = Date.now();

  saveDB(db);
  return note;
}

export type TodayReviewLog = ReviewLog & { note: Note };

export function getTodayReviewLogs(): TodayReviewLog[] {
  const db = getDB();
  if (!db) return [];
  
  const today = localDateKey();
  const todayLogs = db.reviewLogs.filter((l) => l.review_date === today);
  
  const items: TodayReviewLog[] = [];
  for (const log of todayLogs) {
    const note = db.notes.find((n) => n.id === log.note_id);
    if (note) items.push({ ...log, note });
  }
  
  // 按复习时间倒序
  return items.sort((a, b) => b.id - a.id);
}

export function getTodayReviewStats() {
  const logs = getTodayReviewLogs();
  const remembered = logs.filter((l) => l.remembered).length;
  const forgotten = logs.filter((l) => !l.remembered).length;
  const processed = logs.length;
  const pending = getReviewQueue().length;
  const total = processed + pending;
  
  return {
    total,
    processed,
    pending,
    remembered,
    forgotten,
    accuracy: processed > 0 ? Math.round((remembered / processed) * 100) : 0,
  };
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function walkFolderNodes(nodes: FolderNode[], visit: (node: FolderNode, path: string[]) => void, path: string[] = []) {
  for (const node of nodes) {
    const nextPath = [...path, node.title];
    visit(node, nextPath);
    walkFolderNodes(node.children, visit, nextPath);
  }
}

function mapFolderNodes(
  nodes: FolderNode[],
  mapper: (node: FolderNode) => FolderNode
): FolderNode[] {
  return nodes.map((node) => {
    const mappedSelf = mapper(node);
    return {
      ...mappedSelf,
      children: mapFolderNodes(mappedSelf.children, mapper),
    };
  });
}

function removeFolderNodeById(nodes: FolderNode[], nodeId: string): FolderNode[] {
  const next: FolderNode[] = [];
  for (const node of nodes) {
    if (node.id === nodeId) continue;
    next.push({
      ...node,
      children: removeFolderNodeById(node.children, nodeId),
    });
  }
  return next;
}

function insertFolderNode(nodes: FolderNode[], parentNodeId: string, newNode: FolderNode): { nodes: FolderNode[]; inserted: boolean } {
  let inserted = false;
  const next = nodes.map((node) => {
    if (node.id === parentNodeId) {
      inserted = true;
      return {
        ...node,
        children: [...node.children, newNode],
      };
    }
    const childResult = insertFolderNode(node.children, parentNodeId, newNode);
    if (childResult.inserted) inserted = true;
    return {
      ...node,
      children: childResult.nodes,
    };
  });

  return { nodes: next, inserted };
}

function moveFolderNodeInLevel(nodes: FolderNode[], nodeId: string, direction: "up" | "down"): { nodes: FolderNode[]; moved: boolean } {
  const idx = nodes.findIndex((node) => node.id === nodeId);
  if (idx >= 0) {
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= nodes.length) {
      return { nodes, moved: false };
    }
    const next = [...nodes];
    const currentNode = next[idx];
    next[idx] = next[target];
    next[target] = currentNode;
    return { nodes: next, moved: true };
  }

  let moved = false;
  const next = nodes.map((node) => {
    if (moved) return node;
    const childResult = moveFolderNodeInLevel(node.children, nodeId, direction);
    if (!childResult.moved) return node;
    moved = true;
    return {
      ...node,
      children: childResult.nodes,
    };
  });

  return { nodes: next, moved };
}

export function getAllFolders(): FolderTree[] {
  const db = getDB();
  if (!db) return [];
  return [...db.folders];
}

export function moveFolder(folderId: string, direction: "up" | "down"): boolean {
  const db = getDB();
  if (!db) return false;

  const idx = db.folders.findIndex((folder) => folder.id === folderId);
  if (idx < 0) return false;

  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= db.folders.length) return false;

  const currentFolder = db.folders[idx];
  db.folders[idx] = db.folders[target];
  db.folders[target] = currentFolder;
  db.folders[idx].updatedAt = Date.now();
  db.folders[target].updatedAt = Date.now();

  saveDB(db);
  return true;
}

export function addFolder(name: string): FolderTree | null {
  const db = getDB();
  if (!db) return null;
  const folder: FolderTree = {
    id: uid("folder"),
    name: name.trim() || "未命名文件夹",
    created_at: new Date().toISOString(),
    updatedAt: Date.now(),
    nodes: [],
  };
  db.folders.push(folder);
  saveDB(db);
  return folder;
}

export function renameFolder(folderId: string, name: string): boolean {
  const db = getDB();
  if (!db) return false;
  const folder = db.folders.find((f) => f.id === folderId);
  if (!folder) return false;
  folder.name = name.trim() || folder.name;
  folder.updatedAt = Date.now();
  saveDB(db);
  return true;
}

export function deleteFolder(folderId: string): boolean {
  const db = getDB();
  if (!db) return false;
  const before = db.folders.length;
  db.folders = db.folders.filter((f) => f.id !== folderId);
  if (db.folders.length === before) return false;
  pushTombstone(db, "folder", folderId);
  saveDB(db);
  return true;
}

export function addFolderNode(folderId: string, title: string, parentNodeId?: string): FolderNode | null {
  const db = getDB();
  if (!db) return null;
  const folder = db.folders.find((f) => f.id === folderId);
  if (!folder) return null;

  const newNode: FolderNode = {
    id: uid("node"),
    title: title.trim() || "未命名节点",
    children: [],
    linkedNoteIds: [],
  };

  if (!parentNodeId) {
    folder.nodes.push(newNode);
  } else {
    const result = insertFolderNode(folder.nodes, parentNodeId, newNode);
    if (!result.inserted) return null;
    folder.nodes = result.nodes;
  }

  folder.updatedAt = Date.now();

  saveDB(db);
  return newNode;
}

export function updateFolderNode(folderId: string, nodeId: string, title: string): boolean {
  const db = getDB();
  if (!db) return false;
  const folder = db.folders.find((f) => f.id === folderId);
  if (!folder) return false;

  let changed = false;
  folder.nodes = mapFolderNodes(folder.nodes, (node) => {
    if (node.id !== nodeId) return node;
    changed = true;
    return {
      ...node,
      title: title.trim() || node.title,
    };
  });

  if (!changed) return false;
  folder.updatedAt = Date.now();
  saveDB(db);
  return true;
}

export function deleteFolderNode(folderId: string, nodeId: string): boolean {
  const db = getDB();
  if (!db) return false;
  const folder = db.folders.find((f) => f.id === folderId);
  if (!folder) return false;

  const before = JSON.stringify(folder.nodes);
  folder.nodes = removeFolderNodeById(folder.nodes, nodeId);
  const after = JSON.stringify(folder.nodes);
  if (before === after) return false;
  folder.updatedAt = Date.now();
  pushTombstone(db, "folder-node", nodeId);
  saveDB(db);
  return true;
}

export function toggleNodeNoteLink(folderId: string, nodeId: string, noteId: number): boolean {
  const db = getDB();
  if (!db) return false;
  const folder = db.folders.find((f) => f.id === folderId);
  if (!folder) return false;

  let changed = false;
  folder.nodes = mapFolderNodes(folder.nodes, (node) => {
    if (node.id !== nodeId) return node;
    changed = true;
    const exists = node.linkedNoteIds.includes(noteId);
    return {
      ...node,
      linkedNoteIds: exists
        ? node.linkedNoteIds.filter((id) => id !== noteId)
        : [...node.linkedNoteIds, noteId],
    };
  });

  if (!changed) return false;
  folder.updatedAt = Date.now();
  saveDB(db);
  return true;
}

export function moveFolderNode(folderId: string, nodeId: string, direction: "up" | "down"): boolean {
  const db = getDB();
  if (!db) return false;
  const folder = db.folders.find((f) => f.id === folderId);
  if (!folder) return false;

  const result = moveFolderNodeInLevel(folder.nodes, nodeId, direction);
  if (!result.moved) return false;

  folder.nodes = result.nodes;
  folder.updatedAt = Date.now();
  saveDB(db);
  return true;
}

export function linkNodeToNote(folderId: string, nodeId: string, noteId: number): boolean {
  const db = getDB();
  if (!db) return false;
  const folder = db.folders.find((f) => f.id === folderId);
  if (!folder) return false;

  let changed = false;
  folder.nodes = mapFolderNodes(folder.nodes, (node) => {
    if (node.id !== nodeId) return node;
    if (node.linkedNoteIds.includes(noteId)) return node;
    changed = true;
    return {
      ...node,
      linkedNoteIds: [...node.linkedNoteIds, noteId],
    };
  });

  if (!changed) return false;
  folder.updatedAt = Date.now();
  saveDB(db);
  return true;
}

export type FrameworkReviewItem = ReviewQueueItem & {
  folderId: string;
  folderName: string;
  nodeId: string;
  outlinePath: string[];
};

export type KnowledgeGalaxyStatus = "isolated" | "new" | "progress" | "mastered";

export type KnowledgeGalaxyNode = {
  id: number;
  label: string;
  subject: string;
  folderName: string;
  status: KnowledgeGalaxyStatus;
  srsStep: SrsStep | 1;
  familiarity: number;
  priority: number;
  overdueRatio: number;
  errorRate: number;
  reviewCount: number;
  nextReviewTime: number;
  prerequisiteIds: number[];
};

export type KnowledgeGalaxyEdge = {
  source: number;
  target: number;
  kind: "outline";
};

export type KnowledgeGalaxyData = {
  nodes: KnowledgeGalaxyNode[];
  edges: KnowledgeGalaxyEdge[];
  stats: {
    total: number;
    isolated: number;
    progress: number;
    mastered: number;
  };
};

export function getFrameworkReviewQueue(): FrameworkReviewItem[] {
  const db = getDB();
  if (!db) return [];

  const dueItems = getReviewQueue();
  const dueByNoteId = new Map<number, ReviewQueueItem>();
  dueItems.forEach((item) => dueByNoteId.set(item.note_id, item));

  const out: FrameworkReviewItem[] = [];
  for (const folder of db.folders) {
    walkFolderNodes(folder.nodes, (node, path) => {
      for (const linkedNoteId of node.linkedNoteIds) {
        const due = dueByNoteId.get(linkedNoteId);
        if (!due) continue;
        out.push({
          ...due,
          folderId: folder.id,
          folderName: folder.name,
          nodeId: node.id,
          outlinePath: path,
        });
      }
    });
  }

  return out;
}

export function getKnowledgeGalaxyData(): KnowledgeGalaxyData {
  const db = getDB();
  if (!db) {
    return {
      nodes: [],
      edges: [],
      stats: { total: 0, isolated: 0, progress: 0, mastered: 0 },
    };
  }

  const reviewByNoteId = new Map<number, Review>();
  db.reviews.forEach((review) => reviewByNoteId.set(review.note_id, review));
  const logsMap = buildNoteLogsMap(db.reviewLogs);
  const nowMs = Date.now();

  const linkedSet = new Set<number>();
  const prerequisiteMap = new Map<number, Set<number>>();
  const noteFolderMap = new Map<number, string>();
  const edges: KnowledgeGalaxyEdge[] = [];
  const edgeSeen = new Set<string>();

  for (const folder of db.folders) {
    const collectPrerequisites = (node: FolderNode, ancestorLinked: number[]) => {
      if (node.linkedNoteIds.length > 0 && ancestorLinked.length > 0) {
        for (const noteId of node.linkedNoteIds) {
          const set = prerequisiteMap.get(noteId) ?? new Set<number>();
          ancestorLinked.forEach((id) => {
            if (id !== noteId) set.add(id);
          });
          prerequisiteMap.set(noteId, set);
        }
      }
      const nextAncestors = [...ancestorLinked, ...node.linkedNoteIds];
      for (const child of node.children) {
        collectPrerequisites(child, nextAncestors);
      }
    };

    folder.nodes.forEach((node) => collectPrerequisites(node, []));

    walkFolderNodes(folder.nodes, (node) => {
      const linked = node.linkedNoteIds.filter((id) => db.notes.some((n) => n.id === id));
      linked.forEach((id) => {
        linkedSet.add(id);
        if (!noteFolderMap.has(id)) noteFolderMap.set(id, folder.name || "未分类文件夹");
      });

      for (let i = 0; i < linked.length - 1; i++) {
        const a = linked[i];
        const b = linked[i + 1];
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (edgeSeen.has(key)) continue;
        edgeSeen.add(key);
        edges.push({ source: a, target: b, kind: "outline" });
      }
    });
  }

  const nodes: KnowledgeGalaxyNode[] = db.notes.map((note) => {
    const review = reviewByNoteId.get(note.id);
    const reviewState: Review =
      review ??
      {
        note_id: note.id,
        status: normalizeStatus(note.status),
        step: normalizeStep(note.step),
        nextReviewTime: normalizeNextReviewTime(note.nextReviewTime, nowMs),
        srsStep: toLegacySrsStep(normalizeStatus(note.status), normalizeStep(note.step)),
        next_review: null,
      };
    const metrics = computeLearningMetrics(reviewState, logsMap.get(note.id) ?? [], nowMs);
    const step = review?.srsStep ?? 1;
    const linked = linkedSet.has(note.id);
    const prerequisiteIds = Array.from(prerequisiteMap.get(note.id) ?? []);

    let status: KnowledgeGalaxyStatus = "new";
    // 先判断是否建树：未关联节点统一视为孤立，避免被复习阶段颜色覆盖。
    if (!linked) status = "isolated";
    else if (step === 5) status = "mastered";
    else if (step === 2 || step === 3 || step === 4) status = "progress";

    return {
      id: note.id,
      label: note.front || note.question || "未命名",
      subject: note.subject || "未分类",
      folderName: noteFolderMap.get(note.id) || (note.subject || "未分类"),
      status,
      srsStep: step,
      familiarity: metrics.familiarity,
      priority: metrics.priority,
      overdueRatio: metrics.overdueRatio,
      errorRate: metrics.errorRate,
      reviewCount: metrics.reviewCount,
      nextReviewTime: reviewState.nextReviewTime,
      prerequisiteIds,
    };
  });

  return {
    nodes,
    edges,
    stats: {
      total: nodes.length,
      isolated: nodes.filter((n) => n.status === "isolated").length,
      progress: nodes.filter((n) => n.status === "progress").length,
      mastered: nodes.filter((n) => n.status === "mastered").length,
    },
  };
}
