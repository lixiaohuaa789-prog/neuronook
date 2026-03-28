import { addDays, addMonths, setHours, setMinutes } from "date-fns";

export type MemoryStatus = "learning" | "reviewing" | "graduated";
export type ReviewFeedback = "easy" | "hard" | "forgot";

export const LEARNING_STEPS = [5, 30, 720] as const; // 分钟
export const REVIEWING_STEPS = [1, 7, 14, 30] as const; // 天
const GRADUATED_INTERVAL_DAYS = 90;

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function minutesToMs(minutes: number): number {
  return minutes * MS_PER_MINUTE;
}

function daysToMs(days: number): number {
  return days * MS_PER_DAY;
}

export function normalizeStatus(value: unknown): MemoryStatus {
  if (value === "learning" || value === "reviewing" || value === "graduated") {
    return value;
  }
  return "learning";
}

export function normalizeStep(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function normalizeNextReviewTime(value: unknown, fallbackNow: number = Date.now()): number {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  }
  return fallbackNow;
}

export function toLegacySrsStep(status: MemoryStatus, step: number): SrsStep {
  if (status === "graduated") return 5;
  if (status === "learning") return 1;
  return Math.min(4, Math.max(2, step + 2)) as SrsStep;
}

export function fromLegacySrsStep(step: number): { status: MemoryStatus; step: number } {
  const safe = Math.max(1, Math.min(5, Math.floor(step || 1)));
  if (safe <= 1) return { status: "learning", step: 0 };
  if (safe >= 5) return { status: "graduated", step: 0 };
  return { status: "reviewing", step: safe - 2 };
}

export function deriveNextReviewTime(
  status: MemoryStatus,
  step: number,
  nowMs: number = Date.now()
): number {
  if (status === "learning") {
    const idx = Math.max(0, Math.min(LEARNING_STEPS.length - 1, step));
    return nowMs + minutesToMs(LEARNING_STEPS[idx]);
  }
  if (status === "reviewing") {
    const idx = Math.max(0, Math.min(REVIEWING_STEPS.length - 1, step));
    return nowMs + daysToMs(REVIEWING_STEPS[idx]);
  }
  return nowMs + daysToMs(GRADUATED_INTERVAL_DAYS);
}

export function transitionReviewState(
  current: { status: MemoryStatus; step: number },
  feedback: ReviewFeedback,
  nowMs: number = Date.now()
): { status: MemoryStatus; step: number; nextReviewTime: number } {
  const status = normalizeStatus(current.status);
  const step = normalizeStep(current.step);

  if (feedback === "forgot") {
    return {
      status: "learning",
      step: 0,
      nextReviewTime: nowMs + minutesToMs(LEARNING_STEPS[0]),
    };
  }

  if (feedback === "hard") {
    if (status === "reviewing") {
      return {
        status,
        step,
        nextReviewTime: nowMs + daysToMs(REVIEWING_STEPS[0]),
      };
    }
    return {
      status: "learning",
      step,
      nextReviewTime: nowMs + minutesToMs(LEARNING_STEPS[0]),
    };
  }

  if (status === "learning") {
    const nextStep = step + 1;
    if (nextStep >= LEARNING_STEPS.length) {
      return {
        status: "reviewing",
        step: 0,
        nextReviewTime: nowMs + daysToMs(REVIEWING_STEPS[0]),
      };
    }
    return {
      status: "learning",
      step: nextStep,
      nextReviewTime: nowMs + minutesToMs(LEARNING_STEPS[nextStep]),
    };
  }

  if (status === "reviewing") {
    const nextStep = step + 1;
    if (nextStep >= REVIEWING_STEPS.length) {
      return {
        status: "graduated",
        step: 0,
        nextReviewTime: nowMs + daysToMs(GRADUATED_INTERVAL_DAYS),
      };
    }
    return {
      status: "reviewing",
      step: nextStep,
      nextReviewTime: nowMs + daysToMs(REVIEWING_STEPS[nextStep]),
    };
  }

  return {
    status: "graduated",
    step: 0,
    nextReviewTime: nowMs + daysToMs(GRADUATED_INTERVAL_DAYS),
  };
}

// 定义复习阶段枚举（对应你给的《考试脑科学》四步）
export enum ReviewStage {
  NEW = 0, // 刚录入，等待第1次复习
  STAGE_1 = 1, // 已完成第1次
  STAGE_2 = 2, // 已完成第2次
  STAGE_3 = 3, // 已完成第3次
  MASTERED = 4, // 完成4次，转入长期记忆
}

export enum RhythmMode {
  NIGHT = "night", // 睡前黄金期 (建议 21:30)
  LION = "lion", // 狮子/饥饿期 (建议 11:30 或 17:30)
  NORMAL = "normal", // 默认时间
}

// 兼容项目现有的数据字段：Review.srsStep = 1..5
export type SrsStep = 1 | 2 | 3 | 4 | 5;

export function stageToSrsStep(stage: ReviewStage): SrsStep {
  switch (stage) {
    case ReviewStage.NEW:
      return 1;
    case ReviewStage.STAGE_1:
      return 2;
    case ReviewStage.STAGE_2:
      return 3;
    case ReviewStage.STAGE_3:
      return 4;
    case ReviewStage.MASTERED:
      return 5;
  }
}

export function srsStepToStage(step: SrsStep): ReviewStage {
  switch (step) {
    case 1:
      return ReviewStage.NEW;
    case 2:
      return ReviewStage.STAGE_1;
    case 3:
      return ReviewStage.STAGE_2;
    case 4:
      return ReviewStage.STAGE_3;
    case 5:
      return ReviewStage.MASTERED;
  }
}

function getRecommendedRhythmMode(now: Date): RhythmMode {
  const h = now.getHours();
  if (h >= 20 || h <= 2) return RhythmMode.NIGHT;
  if ((h >= 10 && h <= 13) || (h >= 16 && h <= 19)) return RhythmMode.LION;
  return RhythmMode.NORMAL;
}

/**
 * 核心函数 1：输入创建时间，生成《考试脑科学》完整的 4 次复习时间线
 * 注意：这里不做时刻优化（交给 optimizeTimeByRhythm）。
 */
export function generateExamBrainSchedule(createdAt: Date): Date[] {
  const review1 = createdAt;
  const review2 = addDays(review1, 7);
  const review3 = addDays(review2, 14);
  const review4 = addMonths(review3, 1);

  return [review1, review2, review3, review4];
}

/**
 * 核心函数 2：计算下一次复习时间
 * @param currentStage 当前笔记阶段（NEW/STAGE_1/STAGE_2/STAGE_3/MASTERED）
 * @param lastReviewDate 上一次复习时间（新建就是 createdAt）
 * @returns Date | null（MASTERED 不再频繁推送）
 */
export function calculateNextReview(
  currentStage: ReviewStage,
  lastReviewDate: Date
): Date | null {
  switch (currentStage) {
    case ReviewStage.NEW:
      return lastReviewDate;
    case ReviewStage.STAGE_1:
      return addDays(lastReviewDate, 7);
    case ReviewStage.STAGE_2:
      return addDays(lastReviewDate, 14);
    case ReviewStage.STAGE_3:
      return addMonths(lastReviewDate, 1);
    case ReviewStage.MASTERED:
      return null;
  }
}

/**
 * 核心函数 3：结合生物节律，优化到“最佳记忆时刻”
 */
export function optimizeTimeByRhythm(
  reviewDate: Date,
  mode: RhythmMode
): Date {
  let optimizedDate = reviewDate;
  switch (mode) {
    case RhythmMode.NIGHT:
      optimizedDate = setHours(setMinutes(reviewDate, 30), 21);
      break;
    case RhythmMode.LION:
      optimizedDate = setHours(setMinutes(reviewDate, 30), 11);
      break;
    case RhythmMode.NORMAL:
    default:
      optimizedDate = setHours(setMinutes(reviewDate, 0), 9);
      break;
  }
  return optimizedDate;
}

/**
 * 项目内部封装：用默认节律模式计算「录入后的第一次复习」
 */
export function scheduleFirstReview(
  createdIso: string,
  mode?: RhythmMode
): string {
  return createdIso;
}

export function getNextReviewISOByStage(
  stage: ReviewStage,
  lastReviewDate: Date,
  mode?: RhythmMode
): string | null {
  const next = calculateNextReview(stage, lastReviewDate);
  if (!next) return null;
  if (stage === ReviewStage.NEW) return next.toISOString();
  const finalMode = mode ?? getRecommendedRhythmMode(new Date());
  return optimizeTimeByRhythm(next, finalMode).toISOString();
}

export function formatNextReviewHint(value: string | number | null): string {
  if (value == null) return "已掌握 · 长期维护（低频）";
  const next = new Date(value);
  if (!Number.isFinite(next.getTime())) return "待排期";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(next);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return "今天";
  if (diff === 1) return "明天";
  return `${diff} 天后`;
}

/** 卡片主标签：巩固进度 / 已掌握 */
export function srsStepLabel(step: SrsStep): string {
  if (step === 1) return "learning";
  if (step === 5) return "graduated";
  return "reviewing";
}

/** 副文案：双引擎阶段提示 */
export function srsStepHint(step: SrsStep): string {
  if (step === 1) return "learning：5 分钟 / 30 分钟 / 12 小时";
  if (step === 5) return "graduated：长期巡航（默认 90 天）";
  return "reviewing：1 / 7 / 14 / 30 天";
}
