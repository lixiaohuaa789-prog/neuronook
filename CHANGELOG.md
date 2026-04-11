# v1.0.3 (2026-04-11)

- iPad 本地导入热修：新增 iOS 触屏设备原生文件选择控件（可见 input），避免仅依赖程序触发选择器导致无响应。
- 文件读取兼容增强：导入时对旧版 Safari 增加 `FileReader.readAsText` 兜底，不再只依赖 `file.text()`。
- 导入类型放宽：补充 `*/*` 兜底，减少 iPad 文件 App 中 JSON 不可见的问题。

# v1.0.2 (2026-04-11)

- iPad 本地上传兼容性修复：文件选择器改为 `showPicker()` 优先并回退 `click()`，提升 Safari 触发成功率。
- 本地导入文件识别增强：扩展 `accept` 类型并调整隐藏 input 实现，提升 iPad “文件”App 选取稳定性。
- 闪卡批量创建性能优化：批量创建改为单次写库，避免逐条 `saveDB` 引发的长时间卡顿。
- 关联节点写入优化：批量导入后改为一次性批量关联，减少重复 IO。
- 撤销批量导入/批量删除优化：引入批量删除单写入路径，降低大批量删除阻塞。
- 批量任务可视化：新增“处理中/写入中”进度条与 `已处理 x/y`，并在批处理中禁用重复操作按钮。

# v1.0.1 (2026-04-01)

- 复习页交互优化：点击 忘了/模糊/轻松 后保持当前滚动位置，避免跳到顶部。
- 今日任务卡片增强：待复习支持一键定位到知识点列表，已遗忘支持跳转遗忘复盘。
- 进度条样式修复：今日完成度填充色改为主题变量，确保稳定显示。
- 文件夹建树增强：关联闪卡详情支持 Markdown + 数学公式渲染。
- 建树编辑体验修复：关键点仅剩一条时，点击 x 可清空内容。
- 星图体验优化：控制按钮移动到右上；节点详情题目支持完整显示与两端对齐。
- 样式微调：复习页“轻松”按钮色系更新为更清新方案。
- 置顶状态持久化修复：文件夹建树星标刷新后不再丢失。

# 📋 变更摘要：状态流转与打卡逻辑

## 🎯 功能概览

本次更新为「学习应用」添加了 **完整的状态流转与精准的打卡逻辑**，实现了《考试脑科学》4 步循环 + 生物节律优化的核心功能。

---

## 📝 新增文件

### 1. **`lib/reviewHandler.ts`** （核心模块）
- 📌 **`handleReviewResult(noteId, isRemembered, difficulty?)`** 
  - 打卡核心函数
  - 处理状态升级、重置和时间优化
  - 难度感知的节律选择

- 🧪 **`runFullTest()`**
  - 全量测试函数
  - 验证整个状态流转系统
  - 包含 6 个测试阶段

- 🔄 **`resetNoteProgress(noteId)`**
  - 重置单个笔记进度
  - 清除打卡日志
  - 回到 NEW 阶段

- 🧼 **`resetAllNotesProgress()`**
  - 批量重置所有笔记
  - 清除全部打卡日志
  - **危险操作，谨慎使用**

- 📊 辅助函数：
  - `getNoteReviewHistory(noteId)` - 查看单个笔记的打卡历史
  - `getReviewStats()` - 获取全局统计数据

### 2. **`lib/integrationExamples.ts`** （集成示例）
- 展示如何在番茄钟场景中使用打卡函数
- 包含 React 组件集成示例
- 详细的函数调用演示

### 3. **文档文件**
- **`REVIEW_HANDLER_GUIDE.md`** - 完整功能说明文档
  - 核心概念解释
  - API 详细说明
  - 理论背景（《考试脑科学》）
  - 数据结构定义
  
- **`QUICK_START.md`** - 快速启动指南
  - 浏览器控制台测试命令
  - 常用命令速查表
  - 故障排除
  - 实际集成示例

---

## 🔧 文件修改

### **`lib/db.ts`**
```diff
+ export type Note = {
    id: number;
    front: string;
    content: string;
    subject: string;
    created_at: string;
+   difficulty?: "easy" | "normal" | "hard"; ⭐ 新增难度字段
  };

+ export function getLocalDateKey(d?: Date): string ⭐ 导出日期工具函数
```

---

## 🚀 核心功能实现

### 1. **状态流转**（《考试脑科学》4 步）

**流程图：**
```
NEW (T+2)
  ↓ ✅ 记住
STAGE_1 (T+9)
  ↓ ✅ 记住
STAGE_2 (T+23)
  ↓ ✅ 记住
STAGE_3 (T+30)
  ↓ ✅ 记住
MASTERED (低频)

❌ 任何阶段忘记 → 回到 NEW（重建神经元连接）
```

### 2. **难度感知的节律优化**

| 情况 | 节律模式 | 时间 | 原因 |
|------|--------|------|------|
| 难题记住 | NIGHT 🌙 | 21:30 | 睡前黄金期，大脑巩固效果最佳 |
| 普通题记住 | LION 🦁 | 11:30/17:30 | 饥饿期清醒度高 |
| 简单题记住 | NORMAL ⏰ | 09:00 | 常规学习时间 |
| **任何难度忘记** | **LION 🦁** | 11:30/17:30 | 饥饿时重新学习效果最佳 |

### 3. **打卡日志系统**
- 完整记录每次复习的结果
- 按日期和状态阶段追踪
- 支持历史回放和统计分析

### 4. **测试与验证**
- 创建测试笔记，走完整 4 步循环
- 验证难度感知的节律选择
- 模拟遗忘场景确保重置逻辑正确
- 自动清理测试数据

---

## 💡 使用示例

### 基础打卡
```typescript
// 用户完成番茄钟后
const result = handleReviewResult(noteId, true, "hard");
// → 升级到 STAGE_1，推送时间 21:30（NIGHT 模式）

const result = handleReviewResult(noteId, false, "hard");
// → 重置为 NEW，推送时间 11:30（LION 模式）
```

### 全量测试
```typescript
const testResult = runFullTest();
// ✅ 测试通过 → 系统正常
// ❌ 测试失败 → 查看错误信息
```

### 重置操作
```typescript
// 重置单个
resetNoteProgress(noteId);

// 重置全部（危险！）
resetAllNotesProgress();
```

### 数据分析
```typescript
const stats = getReviewStats();
// {
//   totalReviews: 1024,
//   rememberedCount: 900,
//   forgottenCount: 124,
//   accuracyRate: 87.89
// }
```

---

## 📊 数据模型扩展

### Note 类型（新增字段）
```typescript
type Note = {
  // ... 原有字段
  difficulty?: "easy" | "normal" | "hard";  // ⭐ 难度标签
};
```

### ReviewLog 结构（用于追踪）
```typescript
type ReviewLog = {
  id: number;
  note_id: number;
  review_date: string;        // YYYY-MM-DD
  remembered: boolean;        // ✅/❌
  fromStep: SrsStep;         // 做题前的阶段
};
```

---

## 🧪 验证方法

### 1. 编译检查
```bash
npm run build
# ✅ 无 TypeScript 编译错误
```

### 2. 功能测试（浏览器控制台）
```javascript
import { runFullTest } from '/lib/reviewHandler';
const result = runFullTest();
// ✅ 所有 6 个测试阶段通过
```

### 3. 集成测试
- [ ] 创建新笔记，完整走完 4 步循环
- [ ] 在某阶段"忘记"，验证重置为 NEW
- [ ] 检查难度不同时的节律选择
- [ ] 查看统计数据准确性

---

## 🎯 集成检查清单

- [x] ✅ 状态流转逻辑完成
- [x] ✅ 难度感知的节律选择
- [x] ✅ 完整打卡日志系统
- [x] ✅ 全量测试函数
- [x] ✅ 重置逻辑（单个和批量）
- [x] ✅ 统计分析函数
- [x] ✅ TypeScript 类型定义
- [x] ✅ 详细文档和示例

**下一步（可选）：**
- [ ] 在番茄钟页面集成打卡 UI
- [ ] 添加打卡动画和反馈效果
- [ ] 定时推送优化（根据节律模式）
- [ ] 图表化展示学习进度

---

## 📚 文档阅读顺序

1. **快速开始** → [QUICK_START.md](QUICK_START.md)（5 分钟）
2. **完整指南** → [REVIEW_HANDLER_GUIDE.md](REVIEW_HANDLER_GUIDE.md)（20 分钟）
3. **代码注释** → [lib/reviewHandler.ts](lib/reviewHandler.ts)（详细）
4. **集成示例** → [lib/integrationExamples.ts](lib/integrationExamples.ts)（实战）

---

## 🔗 关键概念

- **SRS（间隔复习）** - 根据遗忘曲线安排复习时间
- **《考试脑科学》4 步** - T+2, T+9, T+23, T+30 天的完整循环
- **生物节律** - NIGHT/LION/NORMAL，符合大脑清醒规律
- **海马体神经元** - 遗忘后需要完整重建，不能"补课"
- **难度感知** - 根据知识点难度动态调整学习策略

---

## ✨ 特色亮点

1. 🧠 **基于脑科学** - 忘记重置 NEW，而不是简单重复
2. 🎨 **难度感知** - 难题睡前，简单题饥饿时，精准优化
3. 📊 **完整追踪** - 每次打卡都有记录，支持数据分析
4. 🧪 **自动验证** - `runFullTest()` 确保系统正确运行
5. 📝 **文档完善** - 快速启动 + 详细指南 + 代码示例

---

## 🐛 已知限制

- 时间优化目前是静态的（21:30, 11:30/17:30, 09:00）
- 推送时间未实现（仅计算，需要配合后端）
- 暂无跨设备同步（仅 localStorage）

---

## 📞 支持

如有问题，请检查：
1. [QUICK_START.md](QUICK_START.md) 的故障排除部分
2. [REVIEW_HANDLER_GUIDE.md](REVIEW_HANDLER_GUIDE.md) 的理论背景
3. 打卡日志：`getNoteReviewHistory(noteId)`
4. 系统状态：`runFullTest()`
