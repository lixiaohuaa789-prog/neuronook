# 📚 状态流转与打卡逻辑 - 完整索引

> 🎯 **快速导航**：根据你的需要，选择相应的文档阅读

---

## 🚀 快速开始（5-10 分钟）

**适合人群**：想快速理解功能并测试系统

📖 **阅读**: [QUICK_START.md](QUICK_START.md)
- ✅ 浏览器控制台快速测试命令
- ✅ 常用函数速查表
- ✅ 完整演示代码
- ✅ 故障排除

**推荐操作**：
```javascript
// 在浏览器控制台运行
import { runFullTest } from '/lib/reviewHandler';
runFullTest();  // 验证系统正常 ✅
```

---

## 📖 完整文档（20-30 分钟）

**适合人群**：想深入理解系统设计和理论基础

📖 **阅读**: [REVIEW_HANDLER_GUIDE.md](REVIEW_HANDLER_GUIDE.md)
- 📌 核心概念解释（4 步循环、节律模式等）
- 📌 完整 API 文档（所有函数详解）
- 📌 《考试脑科学》理论背景
- 📌 React 集成示例代码
- 📌 数据结构定义

**重点内容**：
- 为什么忘记要回到 NEW？
- 难度感知的节律选择原理
- 打卡日志如何使用

---

## 🏗️ 系统架构（15-20 分钟）

**适合人群**：想理解系统架构和数据流向

📖 **阅读**: [ARCHITECTURE.md](ARCHITECTURE.md)
- 🏗️ 整体架构图
- 🏗️ 打卡流程详解
- 🏗️ 难度决策树
- 🏗️ 数据流示意
- 🏗️ 文件关系图

**可视化内容**：
- 清晰的 ASCII 流程图
- 状态转换示意
- 重置逻辑说明

---

## 📝 实现代码

### 核心模块：[lib/reviewHandler.ts](lib/reviewHandler.ts)
```typescript
// 主要导出函数

✅ handleReviewResult(noteId, isRemembered, difficulty?)
   → 打卡核心函数，处理所有逻辑

✅ runFullTest()
   → 全量测试，验证系统正确性

✅ resetNoteProgress(noteId)
   → 重置单个笔记

✅ resetAllNotesProgress()
   → 批量重置所有笔记（危险操作）

✅ getNoteReviewHistory(noteId)
   → 查看单个笔记的打卡历史

✅ getReviewStats()
   → 获取全局统计数据
```

**特点**：
- ✅ 完整的 TypeScript 类型
- ✅ 详细的代码注释
- ✅ 错误处理完善
- ✅ 日志记录清晰

---

### 数据层：[lib/db.ts](lib/db.ts)
**改动**：
- 新增 `Note.difficulty` 字段
- 导出 `getLocalDateKey()` 函数
- 完整的数据持久化

---

### 集成示例：[lib/integrationExamples.ts](lib/integrationExamples.ts)
```typescript
// 如何在实际应用中使用

✅ handlePomodoroCompleted(...)
   → 番茄钟完成时的打卡

✅ runSystemTest()
   → 运行系统测试

✅ handleResetNote(...)
   → 重置单个笔记

✅ displayReviewStats()
   → 显示统计数据

// React 组件集成示例代码
```

---

## 📈 版本更新记录

📖 **阅读**: [CHANGELOG.md](CHANGELOG.md)

**包含内容**：
- 新增文件清单
- 修改的文件列表
- 核心功能说明
- 数据模型扩展
- 验证方法
- 集成检查清单

---

## 🧪 测试与验证

### 方法 1：全量测试（推荐）
```javascript
import { runFullTest } from '/lib/reviewHandler';
const result = runFullTest();
// ✅ 所有 6 个步骤通过 = 系统正常
```

### 方法 2：手动测试流程
1. 创建新笔记
2. 完整走 4 步循环
3. 在某阶段"忘记"，验证重置
4. 检查难度不同时的节律选择
5. 验证统计数据正确

### 方法 3：检查编译
```bash
npm run build
# ✅ 无 TypeScript 错误
```

---

## 💡 核心概念速览

| 概念 | 说明 | 时间 |
|------|------|------|
| **NEW** | 初始阶段，等待第一次复习 | T+2 天 |
| **STAGE_1** | 完成第 1 次复习后 | T+9 天 |
| **STAGE_2** | 完成第 2 次复习后 | T+23 天 |
| **STAGE_3** | 完成第 3 次复习后 | T+30 天 |
| **MASTERED** | 完成4步，转入长期记忆 | 低频 |

**重要**：任何阶段忘记 → 直接回到 NEW

| 节律模式 | 时间 | 适用 |
|---------|------|------|
| **NIGHT** 🌙 | 21:30 | 难题（睡前黄金期） |
| **LION** 🦁 | 11:30/17:30 | 普通题（饥饿期） |
| **NORMAL** ⏰ | 09:00 | 简单题（常规） |

**注意**：忘记后总是 LION（饥饿时重新学习）

---

## 📋 功能清单

- [x] 状态流转逻辑（4 步循环）
- [x] 遗忘重置（回到 NEW）
- [x] 难度感知的节律选择
- [x] 打卡日志系统
- [x] 全量测试函数
- [x] 单个/批量重置
- [x] 统计分析
- [x] TypeScript 完整类型定义
- [x] 详细文档（3 份）
- [x] 集成示例代码

---

## 🎯 使用场景

### 场景 1：用户完成番茄钟
```javascript
// 用户在 Pomodoro Focus 模式下复习完一张卡
const result = handleReviewResult(noteId, true, "hard");
// → 升级到 STAGE_1，下次 21:30（NIGHT 模式）
```

### 场景 2：验证系统是否正常
```javascript
// 定期检查系统健康状态
const testResult = runFullTest();
if (!testResult.success) {
  console.error("系统异常！");
  process.exit(1);
}
```

### 场景 3：用户想重新学某个知识点
```javascript
// 用户点击"重新学习"按钮
resetNoteProgress(noteId);
// → 回到 NEW，清空打卡记录
```

### 场景 4：查看学习数据
```javascript
// 在仪表板显示统计
const stats = getReviewStats();
console.log(`正确率：${stats.accuracyRate.toFixed(2)}%`);
```

---

## 🔗 文件导航

```
study-app/
├── lib/
│   ├── reviewHandler.ts ⭐ 核心业务逻辑
│   ├── db.ts (更新 - 新增难度字段)
│   ├── srs.ts (依赖)
│   ├── integrationExamples.ts (示例代码)
│   └── subjectTheme.ts (无变化)
│
├── QUICK_START.md ⭐ 快速开始（推荐首先阅读）
├── REVIEW_HANDLER_GUIDE.md ⭐ 完整功能文档
├── ARCHITECTURE.md ⭐ 系统架构图
├── CHANGELOG.md ⭐ 版本更新
└── README_INDEX.md (本文件)
```

---

## ❓ 常见问题

**Q: 我应该先读哪份文档？**
A: 按照这个顺序：
1. QUICK_START.md（5 分钟快速了解）
2. REVIEW_HANDLER_GUIDE.md（20 分钟理解原理）
3. ARCHITECTURE.md（可选，深入理解）

**Q: 怎样验证系统是否正常工作？**
A: 运行 `runFullTest()`，看是否所有 6 个步骤都通过。

**Q: 国位可以直接集成到我的番茄钟页面吗？**
A: 可以！参考 [lib/integrationExamples.ts](lib/integrationExamples.ts) 中的 React 代码示例。

**Q: 数据存储在哪里？**
A: 存储在浏览器的 localStorage 中，key 为 `study_app_data`。

**Q: 忘记后为什么要回到 NEW？**
A: 根据神经科学研究，海马体需要完整重建。详见文档理论部分。

---

## 🚀 下一步建议

### 立即可做
- [ ] 在浏览器控制台运行 `runFullTest()`
- [ ] 创建测试数据并完整走一遍流程
- [ ] 检查统计数据是否正确

### 短期（1-2 天）
- [ ] 在番茄钟页面集成打卡 UI
- [ ] 添加打卡动画和反馈效果
- [ ] 在复习页面显示打卡历史

### 中期（1-2 周）
- [ ] 集成后端推送系统
- [ ] 添加学习曲线图表分析
- [ ] 实现学习统计仪表板

### 长期（持续优化）
- [ ] 跨设备数据同步
- [ ] AI 推荐复习时间
- [ ] 自动调整难度系数

---

## 📞 技术支持

遇到问题时的排查步骤：

1. **查看错误日志**
   ```javascript
   const result = runFullTest();
   console.log(result.errors);
   ```

2. **检查数据完整性**
   ```javascript
   const db = getDB();
   console.log('笔记数：', db.notes.length);
   console.log('打卡数：', db.reviewLogs.length);
   ```

3. **查看特定笔记的历史**
   ```javascript
   getNoteReviewHistory(noteId);
   ```

4. **阅读文档故障排除部分**
   - [QUICK_START.md - 故障排除](QUICK_START.md#-%E6%95%85%E9%9A%9C%E6%8E%92%E9%9A%A4)

---

## 📞 提示

- 💡 **首次使用**：先读 QUICK_START.md，在控制台测试
- 💡 **深入学习**：阅读 REVIEW_HANDLER_GUIDE.md 理解原理
- 💡 **集成代码**：参考 integrationExamples.ts 的 React 示例
- 💡 **系统健康**：定期运行 runFullTest() 确保正常
- 💡 **紧急重置**：resetAllNotesProgress() 可完全重来（谨慎使用）

---

**更新时间**：2026-03-20  
**版本**：1.0.0  
**状态**：✅ 完成并通过验证
