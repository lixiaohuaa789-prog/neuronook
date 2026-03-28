# 🏗️ 系统架构与流程图

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户交互（番茄钟/复习页面）              │
│                    "记住了" / "忘记了" 按钮 + 难度选择         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│          💫 reviewHandler.ts - 核心业务逻辑                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ handleReviewResult(noteId, remembered, difficulty)   │    │
│  │ - 状态流转（NEW→STAGE_1→...→MASTERED）             │    │
│  │ - 遗忘重置（任何阶段→NEW）                         │    │
│  │ - 难度感知节律优化                                 │    │
│  │ - 生成打卡日志                                     │    │
│  └──────────┬──────────────────────────────┬──────────────┘   │
│             │                              │                  │
│  ┌──────────▼─────────┐      ┌─────────────▼──────────┐       │
│  │ 🧪 runFullTest()   │      │ 🔄 resetNoteProgress() │       │
│  │ 验证完整系统       │      │ 重置单个/全部笔记      │       │
│  └────────────────────┘      └────────────────────────┘       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 📊 统计分析                                            │    │
│  │ - getReviewStats() 全局统计                          │    │
│  │ - getNoteReviewHistory() 单笔历史                    │    │
│  └────────────────────────────────────────────────────────┘    │
└──────────────────┬───────────────────────────────────────────────┘
                   │
        调用 srs.ts 中的：
        - calculateNextReview()
        - optimizeTimeByRhythm()
        - stageToSrsStep() 等转换函数
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│              📦 db.ts - 数据持久化                               │
│                                                                  │
│  更新核心表：                                                    │
│  - reviews: { srsStep, next_review }                           │
│  - reviewLogs: { remembered, fromStep, review_date }          │
│  - notes: { difficulty } ⭐ 新增难度,  │                        │
│  - checkins: { checkin_dates }                                │
└──────────────────┬───────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│              💾 localStorage                                     │
│         （实际存储的JSON数据）                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 打卡流程详解

### 情况 1️⃣：记住了（简单题）

```
用户点击"✅ 记住了"（难度：easy）
            │
            ▼
┌─────────────────────────────────────┐
│ handleReviewResult(id, true, "easy")│
└──────────────┬──────────────────────┘
               │
    ┌──────────┴──────────┐
    │ 是否记住？          │
    │ 是 → 升级           │
    └─────────┬───────────┘
              │
    ┌─────────▼────────────────────────┐
    │ 选择节律模式                      │
    │ difficulty = "easy"              │
    │ → RhythmMode.NORMAL (09:00)     │
    └─────────┬────────────────────────┘
              │
    ┌─────────▼────────────────────────┐
    │ 更新review表                      │
    │ - srsStep: 2 (STAGE_1)          │
    │ - next_review: T+7天             │
    │              (09:00 NORMAL时间)  │
    └─────────┬────────────────────────┘
              │
    ┌─────────▼────────────────────────┐
    │ 创建reviewLog                     │
    │ - remembered: true               │
    │ - fromStep: 1 (NEW)              │
    │ - review_date: 2026-03-20        │
    └─────────┬────────────────────────┘
              │
              ▼
          保存到localStorage
          返回结果给UI
```

### 情况 2️⃣：忘记了（难题）

```
用户点击"❌ 忘记了"（难度：hard）
            │
            ▼
┌─────────────────────────────────────┐
│ handleReviewResult(id, false,"hard")│
└──────────────┬──────────────────────┘
               │
    ┌──────────┴──────────────────┐
    │ 是否记住？                  │
    │ 否 → 回到NEW                │
    └─────────┬──────────────────┘
              │
    ┌─────────▼────────────────────────┐
    │ 根据脑科学：                      │
    │ 选择节律模式 = LION (🦁)         │
    │ （饥饿时重新学习效果最佳）      │
    │ 时间：11:30 或 17:30             │
    └─────────┬────────────────────────┘
              │
    ┌─────────▼────────────────────────┐
    │ 更新review表                      │
    │ - srsStep: 1 (NEW)              │
    │ - next_review: T+2天             │
    │              (11:30 LION时间)   │
    └─────────┬────────────────────────┘
              │
    ┌─────────▼────────────────────────┐
    │ 创建reviewLog                     │
    │ - remembered: false              │
    │ - fromStep: 3 (重置前的阶段)    │
    │ - review_date: 2026-03-20        │
    └─────────┬────────────────────────┘
              │
              ▼
          保存到localStorage
          返回结果给UI
          💡 提示用户："需要重新学习..."
```

---

## 难度感知的节律选择决策树

```
是否记住?
    │
    ├─ YES
    │   │
    │   └─ 难度?
    │       ├─ easy → NORMAL (09:00)
    │       │         └─ "正常学习时间"
    │       │
    │       ├─ normal → LION (11:30/17:30)
    │       │          └─ "饥饿期清醒"
    │       │
    │       └─ hard → NIGHT (21:30)
    │                 └─ "睡前黄金期"
    │
    └─ NO (忘记了)
        │
        └─ ANY difficulty → LION (11:30/17:30)
                           └─ "总是饥饿时重新学"
```

---

## 数据流向

### 命令行调用示例

```javascript
// 1. 用户打卡
const result = handleReviewResult(123, true, "hard");

// 2. 内部流程
// a. 获取当前笔记状态
const db = getDB();
const review = db.reviews.find(r => r.note_id === 123);
// review.srsStep = 1 (NEW)

// b. 计算下一阶段
nextStage = ReviewStage.STAGE_1; // NEW + 1

// c. 根据难度选择节律
selectedMode = RhythmMode.NIGHT; // hard → 睡前

// d. 计算下次复习时间
nextDate = calculateNextReview(STAGE_1, now);
nextDate = optimizeTimeByRhythm(nextDate, NIGHT);
// nextDate = 2026-03-27 21:30

// e. 更新数据库
review.srsStep = 2;
review.next_review = "2026-03-27T21:30:00Z";

// f. 记录打卡日志
reviewLog = {
  id: timestamp,
  note_id: 123,
  review_date: "2026-03-20",
  remembered: true,
  fromStep: 1
};
db.reviewLogs.push(reviewLog);

// g. 保存到localStorage
saveDB(db);

// 返回结果
return {
  success: true,
  nextStage: STAGE_1,
  nextDate: new Date(...),
  selectedMode: NIGHT,
  reviewLog: {...}
};
```

---

## 全量测试的执行流程

```
runFullTest()
    │
    ├─ 1️⃣ createTestNote()
    │   └─ 创建临时笔记，阶段=NEW
    │
    ├─ 2️⃣ handleReviewResult(id, true, "hard")
    │   └─ NEW → STAGE_1，模式=NIGHT
    │
    ├─ 3️⃣ handleReviewResult(id, true, "normal")
    │   └─ STAGE_1 → STAGE_2，模式=LION
    │
    ├─ 4️⃣ handleReviewResult(id, false, "hard")
    │   └─ STAGE_2 → NEW（重置），模式=LION
    │
    ├─ 5️⃣ handleReviewResult(id, true, "easy")
    │   └─ NEW → STAGE_1，模式=NORMAL
    │
    ├─ 6️⃣ cleanupTestNote(id)
    │   └─ 删除测试笔记和日志
    │
    └─ 返回完整的测试报告
        ✅ 所有6个步骤通过
        无需手动干预
```

---

## 重置逻辑

### 单个重置

```
resetNoteProgress(noteId)
    │
    ├─ 查找笔记的 review 记录
    │
    ├─ review.srsStep = 1 (回到 NEW)
    │
    ├─ review.next_review = now (今天复习)
    │
    ├─ 清除所有 reviewLogs (该笔记的打卡记录)
    │
    └─ saveDB()
```

### 批量重置（危险⚠️）

```
resetAllNotesProgress()
    │
    ├─ 所有 review 的 srsStep → 1
    │
    ├─ 所有 review 的 next_review → now
    │
    ├─ db.reviewLogs = [] (清空所有打卡记录)
    │
    └─ saveDB()
    
    ⚠️ 此操作不可逆！
```

---

## 关键指标与状态

### ReviewStage 枚举
```typescript
NEW       = 0  // 初始
STAGE_1   = 1  // T+9
STAGE_2   = 2  // T+23
STAGE_3   = 3  // T+30
MASTERED  = 4  // 已掌握
```

### RhythmMode 枚举
```typescript
NIGHT   = "night"   // 21:30 睡前
LION    = "lion"    // 11:30/17:30 饥饿时
NORMAL  = "normal"  // 09:00 常规
```

### SrsStep（兼容旧系统）
```typescript
1 → NEW
2 → STAGE_1
3 → STAGE_2
4 → STAGE_3
5 → MASTERED
```

---

## 系统健康检查

```javascript
// 运行测试验证系统
const result = runFullTest();
if (result.success) {
  console.log("✅ 系统正常");
} else {
  console.error("❌ 系统故障", result.errors);
}

// 查看统计
const stats = getReviewStats();
// 正确率 > 80% 表示系统工作正常

// 检查最近的打卡
const history = getNoteReviewHistory(noteId);
// 验证日期、状态转换等
```

---

## 文件关系图

```
┌──────────────────────────────────────────────────────────┐
│                    应用入口                              │
│  app/pomodoro/page.tsx                                  │
│  app/review/page.tsx                                    │
└────────────────────┬─────────────────────────────────────┘
                     │ 导入
        ┌────────────┴───────────┐
        │                        │
        ▼                        ▼
┌─────────────────┐      ┌──────────────────────────┐
│ lib/db.ts       │      │ lib/reviewHandler.ts ⭐  │
│                 │      │ (新增 - 核心逻辑)      │
│ - getDB()       │      │ - handleReviewResult()  │
│ - saveDB()      │      │ - runFullTest()         │
│ - addNote()     │◄─────┤ - resetNoteProgress()   │
│ - Note type     │      │ - getReviewStats()      │
└─────────────────┘      └────────────┬─────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │                        │
                         ▼                        ▼
                  ┌─────────────────┐      ┌──────────────┐
                  │ lib/srs.ts      │      │ 文档         │
                  │                 │      │              │
                  │ - calculateNext │      │ - GUIDE      │
                  │ - optimizeTime  │      │ - QUICKSTART│
                  └─────────────────┘      │ - CHANGELOG │
                                           └──────────────┘
```

---

## 🎯 验收标准

- [x] 状态流转正确（NEW → ... → MASTERED）
- [x] 遗忘重置正确（任何→NEW）
- [x] 难度感知选择（hard→NIGHT, normal→LION, easy→NORMAL）
- [x] 打卡日志完整
- [x] 测试函数通过
- [x] 重置逻辑工作
- [x] 统计数据准确
- [x] TypeScript类型正确
