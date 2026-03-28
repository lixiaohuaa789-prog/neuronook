/**
 * 📝 打卡逻辑模块：处理用户在番茄钟完成复习后的状态流转
 * 核心理念：根据《考试脑科学》，记住→升级，忘记→重置为 NEW
 */

import {
  calculateNextReview,
  fromLegacySrsStep,
  toLegacySrsStep,
  optimizeTimeByRhythm,
  ReviewStage,
  RhythmMode,
  stageToSrsStep,
  srsStepToStage,
  getNextReviewISOByStage,
} from "./srs";
import {
  getDB,
  saveDB,
  getLocalDateKey,
  Note,
  Review,
  ReviewLog,
  type StudyDB,
} from "./db";

/** 扩展 Note 类型，包含难度标签 */
export type Difficulty = "easy" | "normal" | "hard";

export type NoteWithDifficulty = Note & {
  difficulty?: Difficulty;
};

/**
 * 核心函数：打卡结果处理
 * @param noteId 知识点 ID
 * @param isRemembered 用户是否记住了
 * @param difficulty 可选：知识点难度（影响下次复习时间的节律选择）
 */
export function handleReviewResult(
  noteId: number,
  isRemembered: boolean,
  difficulty: Difficulty = "normal"
) {
  const db = getDB();
  if (!db) throw new Error("数据库不可用");

  const note = db.notes.find((n) => n.id === noteId);
  const review = db.reviews.find((r) => r.note_id === noteId);

  if (!note || !review) {
    throw new Error(`笔记 ID ${noteId} 不存在`);
  }

  const currentStage = srsStepToStage(review.srsStep);
  const now = new Date();

  let nextStage: ReviewStage;
  let nextDate: Date | null;
  let selectedMode: RhythmMode;

  if (isRemembered) {
    // ✅ 记住了：升级到下一阶段
    nextStage = getNextStage(currentStage);

    // 计算基础的下一次复习日期
    nextDate = calculateNextReview(nextStage, now);

    // 🧠 智能选择节律模式：难题推荐睡前复习，简单题推荐饥饿时
    if (difficulty === "hard" && nextDate) {
      selectedMode = RhythmMode.NIGHT;
      nextDate = optimizeTimeByRhythm(nextDate, selectedMode);
    } else if (difficulty === "easy" && nextDate) {
      selectedMode = RhythmMode.NORMAL;
      nextDate = optimizeTimeByRhythm(nextDate, selectedMode);
    } else {
      selectedMode = RhythmMode.LION;
      if (nextDate) nextDate = optimizeTimeByRhythm(nextDate, selectedMode);
    }
  } else {
    // ❌ 忘记了：根据《考试脑科学》，直接回到 NEW，重新走完整 4 步
    // 原因：需要重建海马体神经元连接，不能只复习这一题
    nextStage = ReviewStage.NEW;
    nextDate = calculateNextReview(ReviewStage.NEW, now);

    // 饥饿时（LION 模式）重新挑战，效果最佳
    selectedMode = RhythmMode.LION;
    if (nextDate) nextDate = optimizeTimeByRhythm(nextDate, selectedMode);
  }

  // 更新核心数据：阶段 + 下次复习时间
  const nextLegacyStep = stageToSrsStep(nextStage);
  const nextState = fromLegacySrsStep(nextLegacyStep);
  const nextTime = nextDate ? nextDate.getTime() : Date.now() + 90 * 24 * 60 * 60 * 1000;

  review.status = nextState.status;
  review.step = nextState.step;
  review.nextReviewTime = nextTime;
  review.srsStep = toLegacySrsStep(review.status, review.step);
  review.next_review = new Date(review.nextReviewTime).toISOString();

  note.status = review.status;
  note.step = review.step;
  note.nextReviewTime = review.nextReviewTime;

  // 📊 记录打卡日志（用于分析和统计）
  const reviewLog: ReviewLog = {
    id: Date.now(),
    note_id: noteId,
    review_date: getLocalDateKey(),
    remembered: isRemembered,
    fromStep: stageToSrsStep(currentStage),
  };
  db.reviewLogs.push(reviewLog);

  // 打卡签到
  touchDailyCheckin(db);

  // 持久化
  saveDB(db);

  return {
    success: true,
    nextStage,
    nextDate,
    selectedMode,
    reviewLog,
  };
}

/**
 * 获取下一个阶段
 */
function getNextStage(current: ReviewStage): ReviewStage {
  switch (current) {
    case ReviewStage.NEW:
      return ReviewStage.STAGE_1;
    case ReviewStage.STAGE_1:
      return ReviewStage.STAGE_2;
    case ReviewStage.STAGE_2:
      return ReviewStage.STAGE_3;
    case ReviewStage.STAGE_3:
    case ReviewStage.MASTERED:
      return ReviewStage.MASTERED;
  }
}

/**
 * 打卡签到（更新每日打卡记录）
 */
function touchDailyCheckin(db: StudyDB) {
  if (!Array.isArray(db.checkins)) db.checkins = [];
  const key = getLocalDateKey();
  if (!db.checkins.includes(key)) db.checkins.push(key);
}

/**
 * 🧪 全量测试：验证整个状态流转流程
 * 创建一份测试数据，经历完整的 4 步循环，验证各个环节
 */
export function runFullTest(): {
  success: boolean;
  testResults: Array<{
    step: number;
    action: string;
    currentStage: ReviewStage;
    nextStage: ReviewStage;
    result: string;
  }>;
  errors: string[];
} {
  const testResults: typeof arguments[0]["testResults"] = [];
  const errors: string[] = [];

  try {
    // 1️⃣ 创建测试笔记
    const testNote = createTestNote("全量测试知识点");
    console.log(
      `✅ Step 1: 创建测试笔记 ID=${testNote.id}, 初始阶段=NEW`
    );
    testResults.push({
      step: 1,
      action: "createTestNote",
      currentStage: ReviewStage.NEW,
      nextStage: ReviewStage.NEW,
      result: `创建笔记 ID=${testNote.id}`,
    });

    // 2️⃣ 模拟第 1 次复习：记住 → STAGE_1
    const result1 = handleReviewResult(testNote.id, true, "hard");
    console.log(
      `✅ Step 2: 第1次复习，记住（难题），升级到 ${result1.nextStage}`
    );
    testResults.push({
      step: 2,
      action: "review1_remembered",
      currentStage: ReviewStage.NEW,
      nextStage: result1.nextStage,
      result: `升级到 STAGE_1，推送时间模式=${result1.selectedMode}`,
    });

    // 3️⃣ 模拟第 2 次复习：记住 → STAGE_2
    const result2 = handleReviewResult(testNote.id, true, "normal");
    console.log(`✅ Step 3: 第2次复习，记住（普通），升级到 ${result2.nextStage}`);
    testResults.push({
      step: 3,
      action: "review2_remembered",
      currentStage: result1.nextStage,
      nextStage: result2.nextStage,
      result: `升级到 STAGE_2，推送时间模式=${result2.selectedMode}`,
    });

    // 4️⃣ 模拟第 3 次复习：忘记 → 回到 NEW
    const result3 = handleReviewResult(testNote.id, false, "hard");
    console.log(
      `⚠️  Step 4: 第3次复习，忘记，根据脑科学重置为 NEW（重新建立神经元连接）`
    );
    testResults.push({
      step: 4,
      action: "review3_forgotten",
      currentStage: result2.nextStage,
      nextStage: result3.nextStage,
      result: `重置为 NEW，推送时间模式=${result3.selectedMode}（饥饿时重新挑战）`,
    });

    // 5️⃣ 再次升级：记住 → STAGE_1
    const result4 = handleReviewResult(testNote.id, true, "easy");
    console.log(
      `✅ Step 5: 重新复习后记住（简单），升级到 ${result4.nextStage}`
    );
    testResults.push({
      step: 5,
      action: "review4_remembered",
      currentStage: result3.nextStage,
      nextStage: result4.nextStage,
      result: `升级到 STAGE_1，推送时间模式=${result4.selectedMode}`,
    });

    // 清理测试数据
    cleanupTestNote(testNote.id);
    console.log(`🧹 Step 6: 清理测试笔记`);
    testResults.push({
      step: 6,
      action: "cleanup",
      currentStage: ReviewStage.NEW,
      nextStage: ReviewStage.NEW,
      result: "已删除测试笔记",
    });

    return {
      success: true,
      testResults,
      errors,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    console.error("❌ 测试失败:", msg);
    return {
      success: false,
      testResults,
      errors,
    };
  }
}

/**
 * 创建测试笔记（辅助函数）
 */
function createTestNote(title: string) {
  const db = getDB();
  if (!db) throw new Error("数据库不可用");

  const testNote: Note = {
    id: Date.now(),
    front: `[TEST] ${title}`,
    content: "这是一份自动化全量测试数据，用于验证状态流转逻辑。",
    subject: "TEST",
    created_at: new Date().toISOString(),
    status: "learning",
    step: 0,
    nextReviewTime: Date.now(),
  };

  db.notes.push(testNote);
  db.reviews.push({
    note_id: testNote.id,
    status: "learning",
    step: 0,
    nextReviewTime: Date.now(),
    srsStep: 1,
    next_review: new Date().toISOString(),
  });

  saveDB(db);
  return testNote;
}

/**
 * 清理测试笔记
 */
function cleanupTestNote(noteId: number) {
  const db = getDB();
  if (!db) return;

  db.notes = db.notes.filter((n) => n.id !== noteId);
  db.reviews = db.reviews.filter((r) => r.note_id !== noteId);
  db.reviewLogs = db.reviewLogs.filter((l) => l.note_id !== noteId);

  saveDB(db);
}

/**
 * 🔄 重置某个笔记的复习进度：回到 NEW 阶段，清空所有打卡记录
 * 场景：用户想要重新学习某个已掌握的知识点
 */
export function resetNoteProgress(noteId: number): void {
  const db = getDB();
  if (!db) throw new Error("数据库不可用");

  const review = db.reviews.find((r) => r.note_id === noteId);
  if (!review) throw new Error(`笔记 ID ${noteId} 的复习记录不存在`);

  // 1. 重置为初始状态
  review.status = "learning";
  review.step = 0;
  review.nextReviewTime = Date.now();
  review.srsStep = 1;
  review.next_review = new Date(review.nextReviewTime).toISOString();

  const note = db.notes.find((n) => n.id === noteId);
  if (note) {
    note.status = review.status;
    note.step = review.step;
    note.nextReviewTime = review.nextReviewTime;
  }

  // 2. 清除该笔记的所有打卡日志
  db.reviewLogs = db.reviewLogs.filter((log) => log.note_id !== noteId);

  saveDB(db);
  console.log(`🔄 笔记 ID=${noteId} 已重置为初始状态`);
}

/**
 * 🧼 批量重置全部笔记
 * 场景：用户想要从头开始学习所有知识点（危险操作）
 */
export function resetAllNotesProgress(): {
  resetCount: number;
  logsCleared: number;
} {
  const db = getDB();
  if (!db) throw new Error("数据库不可用");

  let resetCount = 0;
  let logsCleared = 0;

  // 重置所有复习记录
  for (const review of db.reviews) {
    review.status = "learning";
    review.step = 0;
    review.nextReviewTime = Date.now();
    review.srsStep = 1;
    review.next_review = new Date(review.nextReviewTime).toISOString();
    resetCount++;
  }

  for (const note of db.notes) {
    note.status = "learning";
    note.step = 0;
    note.nextReviewTime = Date.now();
  }

  // 清除所有打卡日志
  logsCleared = db.reviewLogs.length;
  db.reviewLogs = [];

  saveDB(db);
  console.log(
    `🧼 已重置 ${resetCount} 份笔记，清除 ${logsCleared} 条打卡记录`
  );

  return { resetCount, logsCleared };
}

/**
 * 📊 获取某笔记的打卡历史
 */
export function getNoteReviewHistory(noteId: number): ReviewLog[] {
  const db = getDB();
  if (!db) return [];
  return db.reviewLogs.filter((log) => log.note_id === noteId).sort((a, b) => a.id - b.id);
}

/**
 * 📈 获取全局复习统计
 */
export function getReviewStats(): {
  totalReviews: number;
  rememberedCount: number;
  forgottenCount: number;
  accuracyRate: number;
} {
  const db = getDB();
  if (!db) return { totalReviews: 0, rememberedCount: 0, forgottenCount: 0, accuracyRate: 0 };

  const logs = db.reviewLogs;
  const rememberedCount = logs.filter((l) => l.remembered).length;
  const forgottenCount = logs.filter((l) => !l.remembered).length;
  const totalReviews = logs.length;
  const accuracyRate = totalReviews > 0 ? (rememberedCount / totalReviews) * 100 : 0;

  return {
    totalReviews,
    rememberedCount,
    forgottenCount,
    accuracyRate,
  };
}
