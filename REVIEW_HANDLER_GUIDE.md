## 📝 状态流转与打卡逻辑完整指南

### 🎯 核心概念

#### 1. **复习阶段（Review Stage）**
系统采用《考试脑科学》的 **4 步循环**：

```
┌─────────────────────────────────────────────────────┐
│          NEW (初始阶段)                              │
│    第 1 次复习前，等待中 (T+2 天)                    │
└────────────────────┬────────────────────────────────┘
                     │ ✅ 记住了
                     ▼
┌─────────────────────────────────────────────────────┐
│          STAGE_1 (第 1 阶段)                         │
│    完成第 1 次复习，下一次 T+7 天                    │
└────────────────────┬────────────────────────────────┘
                     │ ✅ 记住了
                     ▼
┌─────────────────────────────────────────────────────┐
│          STAGE_2 (第 2 阶段)                         │
│    完成第 2 次复习，下一次 T+14 天                   │
└────────────────────┬────────────────────────────────┘
                     │ ✅ 记住了
                     ▼
┌─────────────────────────────────────────────────────┐
│          STAGE_3 (第 3 阶段)                         │
│    完成第 3 次复习，下一次 T+30 天                   │
└────────────────────┬────────────────────────────────┘
                     │ ✅ 记住了
                     ▼
┌─────────────────────────────────────────────────────┐
│          MASTERED (已掌握)                           │
│    进入长期记忆，低频维护                            │
└─────────────────────────────────────────────────────┘

⚠️  如果任何阶段忘记了 ❌
    └─→ 直接回到 NEW（重建神经元连接）
```

#### 2. **生物节律优化（Rhythm Modes）**

系统根据知识点难度和当前时间，**智能选择最佳复习时刻**：

| 节律模式 | 推荐时间 | 适用场景 |
|---------|--------|--------|
| **NIGHT** 🌙 | 21:30 | 睡前黄金期，适合破解**难题** |
| **LION** 🦁 | 11:30 或 17:30 | 饥饿/清醒期，适合从头学习 |
| **NORMAL** ⏰ | 09:00 | 默认时间，一般知识点 |

#### 3. **难度感知的时间安排**

- **简单题**（easy）：正常时间复习，巩固即可 
- **普通题**（normal）：饥饿时（LION 模式）复习，提高注意力
- **难题**（hard）：睡前（NIGHT 模式）复习，大脑在睡眠中巩固

---

### 🚀 主要 API

#### **`handleReviewResult(noteId, isRemembered, difficulty?)`**
**核心函数** - 处理一次复习结果

```typescript
import { handleReviewResult } from "@/lib/reviewHandler";

// 用户在番茄钟完成后点击"记住了"
const result = handleReviewResult(
  note.id,          // 笔记 ID
  true,             // 是否记住
  "hard"            // 难度等级（可选，默认 "normal"）
);

console.log(result);
// {
//   success: true,
//   nextStage: ReviewStage.STAGE_1,      // 升级到的阶段
//   nextDate: Date,                       // 下次复习时间
//   selectedMode: RhythmMode.NIGHT,      // 选择的节律模式
//   reviewLog: ReviewLog                  // 打卡记录
// }
```

**状态流转逻辑：**
- ✅ **记住了** → `currentStage + 1`
  - 难题（hard）→ 选择 NIGHT 模式（睡前）
  - 普通题 → 选择 LION 模式（饥饿时）
  - 简单题 → 选择 NORMAL 模式（正常）

- ❌ **忘记了** → 回到 `NEW`
  - 总是选择 LION 模式（饥饿时重新挑战）
  - 强制重新走完整 4 步循环

---

#### **`runFullTest()`**
**测试函数** - 验证整个状态流转系统是否正确

```typescript
import { runFullTest } from "@/lib/reviewHandler";

const testResult = runFullTest();

if (testResult.success) {
  console.log("✅ 全量测试通过！");
  console.table(testResult.testResults);
  // 输出：
  // 1. 创建测试笔记
  // 2. 第1次复习，记住（难题）→ STAGE_1
  // 3. 第2次复习，记住（普通）→ STAGE_2
  // 4. 第3次复习，忘记 → 回到 NEW
  // 5. 重新复习后记住 → STAGE_1
  // 6. 清理测试数据
} else {
  console.error("❌ 测试失败", testResult.errors);
}
```

**测试涵盖的场景：**
- ✅ 状态升级流程
- ❌ 忘记后的重置行为
- 🎨 难度感知的节律选择
- 📊 打卡日志记录
- 🧹 数据清理

---

#### **`resetNoteProgress(noteId)`**
**重置函数** - 将某个笔记重置为初始状态

```typescript
import { resetNoteProgress } from "@/lib/reviewHandler";

// 用户点击"重新学习"按钮
resetNoteProgress(noteId);
// 结果：
// - 阶段回到 NEW
// - 所有打卡日志被清除
// - 下次复习时间更新为今天
```

**使用场景：**
- 用户想重新学习某个已掌握的知识点
- 发现之前的学习记录有误
- 需要重新巩固某个特定题目

---

#### **`resetAllNotesProgress()`**
**危险操作** - 批量重置所有笔记

```typescript
import { resetAllNotesProgress } from "@/lib/reviewHandler";

const result = resetAllNotesProgress();
console.log(result);
// {
//   resetCount: 42,      // 重置的笔记数
//   logsCleared: 1024    // 清除的打卡记录数
// }
```

⚠️ **警告**：此操作 **不可撤销**，请谨慎使用！

---

### 📊 辅助函数

#### **`getNoteReviewHistory(noteId)`**
获取某笔记的完整打卡历史

```typescript
const history = getNoteReviewHistory(123);
// [
//   { id: ..., note_id: 123, review_date: "2026-03-20", remembered: true, fromStep: 1 },
//   { id: ..., note_id: 123, review_date: "2026-03-27", remembered: true, fromStep: 2 },
//   ...
// ]
```

#### **`getReviewStats()`**
获取全局复习统计

```typescript
const stats = getReviewStats();
// {
//   totalReviews: 1024,       // 总复习次数
//   rememberedCount: 900,     // 记住的次数
//   forgottenCount: 124,      // 忘记的次数
//   accuracyRate: 87.89       // 正确率（%）
// }
```

---

### 💻 React 集成示例

#### 在番茄钟页面集成打卡

```tsx
'use client';

import { useState } from 'react';
import { handleReviewResult, type Difficulty } from '@/lib/reviewHandler';
import { getReviewQueue } from '@/lib/db';

export default function ReviewMode() {
  const [queue, setQueue] = useState(getReviewQueue());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [feedback, setFeedback] = useState('');

  const current = queue[currentIndex];
  if (!current) return <div>No cards to review</div>;

  const handleReview = (remembered: boolean) => {
    try {
      const result = handleReviewResult(current.note_id, remembered, difficulty);
      
      setFeedback(
        remembered
          ? `✅ 升级到 ${result.nextStage}！\n推送模式：${result.selectedMode}`
          : `❌ 重置为 NEW，需要重新学习（${result.selectedMode}）`
      );

      // 移到下一张卡
      setTimeout(() => {
        setCurrentIndex((i) => i + 1);
        setDifficulty('normal');
        setFeedback('');
      }, 2000);
    } catch (error) {
      setFeedback(`❌ 打卡失败：${error.message}`);
    }
  };

  return (
    <div className="review-container">
      <div className="card">
        <h2>{current.note.front}</h2>
        <p>{current.note.content}</p>

        <div className="difficulty-selector">
          <label>
            <input
              type="radio"
              value="easy"
              checked={difficulty === 'easy'}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            />
            简单
          </label>
          <label>
            <input
              type="radio"
              value="normal"
              checked={difficulty === 'normal'}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            />
            普通
          </label>
          <label>
            <input
              type="radio"
              value="hard"
              checked={difficulty === 'hard'}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            />
            困难
          </label>
        </div>

        <div className="actions">
          <button onClick={() => handleReview(true)}>✅ 记住了</button>
          <button onClick={() => handleReview(false)}>❌ 忘记了</button>
        </div>

        {feedback && <div className="feedback">{feedback}</div>}
      </div>
    </div>
  );
}
```

---

### 🔍 数据结构

#### Note（笔记）
```typescript
type Note = {
  id: number;                    // 唯一 ID，时间戳
  front: string;                 // 卡片正面（问题）
  content: string;               // 卡片背面（答案）
  subject: string;               // 分类
  created_at: string;            // 创建时间（ISO 8601）
  difficulty?: "easy" | "normal" | "hard"; // ⭐ 难度标签
};
```

#### Review（复习记录）
```typescript
type Review = {
  note_id: number;               // 笔记 ID
  srsStep: SrsStep;              // 当前步数（1-5）
  next_review: string | null;    // 下次复习时间（ISO 8601）
};
```

#### ReviewLog（打卡日志）
```typescript
type ReviewLog = {
  id: number;                    // 唯一 ID
  note_id: number;               // 笔记 ID
  review_date: string;           // 复习日期（YYYY-MM-DD）
  remembered: boolean;           // 是否记住
  fromStep: SrsStep;             // 做题前的阶段
};
```

---

### 🧠 《考试脑科学》理论基础

**为什么忘记了要回到 NEW？**

根据 Spaced Repetition 和神经科学研究：

1. **海马体需要重建** - 忘记意味着神经元连接受损，需要完整地重新建立
2. **不能"补课"** - 只复习这一题不足以重建连接，必须重新走完整的 T+2, T+9, T+23, T+30 周期
3. **生物节律很重要** - 不同时段学习效果不同：
   - 🌙 睡前：长期记忆巩固效率高
   - 🦁 饥饿时：大脑清醒度最高，适合从零学习

---

### 📈 监控与优化

**如何知道系统是否正常工作？**

```typescript
import { getReviewStats } from '@/lib/reviewHandler';

const stats = getReviewStats();

// 健康指标
- 正确率 > 80% → 算法参数设置合理 ✅
- 正确率 < 60% → 需要调整难度系统或增加复习频率 ⚠️
- 打卡记录趋势上升 → 学习效果递进 ✅
```

**运行测试验证系统**

```typescript
import { runFullTest } from '@/lib/reviewHandler';

// 每次大版本更新或部署前运行
const result = runFullTest();
if (!result.success) {
  console.error('系统异常，请检查');
  process.exit(1);
}
```

---

### ✅ 快速清单

- [x] 状态流转逻辑（NEW → STAGE_1 → STAGE_2 → STAGE_3 → MASTERED）
- [x] 忘记重置为 NEW（根据脑科学）
- [x] 难度感知的节律选择
- [x] 完整的打卡日志记录
- [x] 全量测试函数
- [x] 重置逻辑（单个 + 批量）
- [x] 统计分析函数
- [x] React 集成示例

---

### 🎬 下一步

1. **在番茄钟页面集成** - 当用户完成 25 分钟计时后调用 `handleReviewResult`
2. **添加 UI 反馈** - 显示升级动画或贺词
3. **定时推送优化** - 根据节律模式自动调度推送时间
4. **数据分析** - 定期查看正确率和学习趋势
