## 🚀 快速启动指南

### 🏁 开发环境与生产环境

#### 开发环境（热更新）

1. 安装依赖（首次）

```bash
npm install
```

2. 启动开发服务

```bash
npm run dev
```

3. 浏览器访问

```text
http://localhost:3000
```

说明：开发模式下 `NODE_ENV=development`，用于联调和排错。

#### 生产环境（本机模拟线上）

1. 先构建

```bash
npm run build
```

2. 再启动生产服务

```bash
npm run start
```

3. 浏览器访问

```text
http://localhost:3000
```

说明：生产模式下 `NODE_ENV=production`，用于验证线上行为（例如仅在开发环境显示的调试信息会隐藏）。

#### 常见切换顺序

从开发切到生产：

```bash
# Ctrl + C 停掉 dev
npm run build
npm run start
```

从生产切回开发：

```bash
# Ctrl + C 停掉 start
npm run dev
```

### 0️⃣ 在浏览器控制台测试

打开应用后，在浏览器 DevTools（F12）的 Console 标签页，执行以下代码：

---

### 1️⃣ 运行全量测试 ✅

**验证整个系统是否正常工作**

```javascript
// 从模块导入（在实际代码中）
// 但在浏览器控制台，你可以这样测试：

// 方法 1: 直接导入并运行
import { runFullTest } from '/lib/reviewHandler';
const result = runFullTest();
console.log('测试结果:', result);
```

**预期输出：**
```
✅ Step 1: 创建测试笔记 ID=1711000000000, 初始阶段=NEW
✅ Step 2: 第1次复习，记住（难题），升级到 STAGE_1
✅ Step 3: 第2次复习，记住（普通），升级到 STAGE_2
⚠️  Step 4: 第3次复习，忘记，根据脑科学重置为 NEW（重新建立神经元连接）
✅ Step 5: 重新复习后记住（简单），升级到 STAGE_1
🧹 Step 6: 清理测试笔记
```

---

### 2️⃣ 创建一张真实卡片并测试打卡流程 📝

```javascript
import { addNote } from '/lib/db';
import { handleReviewResult } from '/lib/reviewHandler';

// 1. 创建新卡片
addNote({
  front: "什么是海马体？",
  content: "海马体是大脑中负责长期记忆转化的器官，对学习很重要。",
  subject: "神经科学"
});

// 2. 获取这张卡片的 ID
import { getReviewQueue } from '/lib/db';
const queue = getReviewQueue();
const noteId = queue[0].note.id;

console.log(`📝 新创建的卡片 ID: ${noteId}`);

// 3. 模拟打卡：记住了（难题）
const result1 = handleReviewResult(noteId, true, "hard");
console.log("✅ 第1次：记住了（难题）", result1);

// 4. 查看历史
import { getNoteReviewHistory } from '/lib/reviewHandler';
const history = getNoteReviewHistory(noteId);
console.log("📋 打卡历史:", history);

// 5. 查看统计
import { getReviewStats } from '/lib/reviewHandler';
const stats = getReviewStats();
console.log("📈 统计数据:", stats);
```

---

### 3️⃣ 测试重置逻辑 🔄

```javascript
import { getNoteReviewHistory, resetNoteProgress } from '/lib/reviewHandler';

// 假设有个已掌握的卡片（ID=123）
const noteId = 123;

// 查看当前状态
let history = getNoteReviewHistory(noteId);
console.log("重置前的历史:", history);

// 执行重置
resetNoteProgress(noteId);

// 查看重置后的状态
history = getNoteReviewHistory(noteId);
console.log("重置后的历史:", history);
```

---

### 4️⃣ 查看所有复习数据 📊

```javascript
import { getDB } from '/lib/db';
import { getReviewStats } from '/lib/reviewHandler';

// 获取完整数据库
const db = getDB();

console.log("📚 笔记总数:", db.notes.length);
console.log("📋 复习记录:", db.reviews.length);
console.log("📝 打卡日志:", db.reviewLogs.length);

// 查看统计
const stats = getReviewStats();
console.table({
  "总复习次数": stats.totalReviews,
  "记住": stats.rememberedCount,
  "忘记": stats.forgottenCount,
  "正确率(%)": stats.accuracyRate.toFixed(2)
});
```

---

### 5️⃣ 测试难度感知的节律选择 🧠

```javascript
import { handleReviewResult } from '/lib/reviewHandler';

// 假设有个卡片 ID=456
const noteId = 456;

console.log("测试不同难度的节律选择：\n");

// 简单题
const easy = handleReviewResult(noteId, true, "easy");
console.log("简单题 → " + easy.selectedMode, "@ " + easy.nextDate);

// 普通题
const normal = handleReviewResult(noteId, true, "normal");
console.log("普通题 → " + normal.selectedMode, "@ " + normal.nextDate);

// 难题
const hard = handleReviewResult(noteId, true, "hard");
console.log("难题 → " + hard.selectedMode, "@ " + hard.nextDate);

// 忘记后
const forgotten = handleReviewResult(noteId, false, "hard");
console.log("忘记 → " + forgotten.selectedMode, "（总是 LION！）");
```

---

### 6️⃣ 完整的打卡流程演示 🎯

```javascript
import { addNote, getReviewQueue } from '/lib/db';
import { handleReviewResult, getNoteReviewHistory, getReviewStats } from '/lib/reviewHandler';

console.log("=== 完整打卡流程演示 ===\n");

// 1️⃣ 创建卡片
console.log("1️⃣ 创建新卡片...");
addNote({
  front: "SRS 间隔复习的第一个间隔是？",
  content: "根据《考试脑科学》，第一个间隔应该是 T+2（2天后）",
  subject: "学习方法"
});

// 2️⃣ 获取卡片
const queue = getReviewQueue();
const note = queue[0];
const noteId = note.note.id;
console.log("2️⃣ 卡片已创建，ID:", noteId, "\n");

// 3️⃣ 第一次复习
console.log("3️⃣ 第一次复习 - 用户记住了（难题）");
const r1 = handleReviewResult(noteId, true, "hard");
console.log(`   升级到: ${r1.nextStage}`);
console.log(`   下次时间: ${r1.nextDate?.toLocaleString()}`);
console.log(`   节律模式: ${r1.selectedMode} (睡前复习)\n`);

// 4️⃣ 第二次复习
console.log("4️⃣ 第二次复习 - 用户记住了（普通）");
const r2 = handleReviewResult(noteId, true, "normal");
console.log(`   升级到: ${r2.nextStage}`);
console.log(`   下次时间: ${r2.nextDate?.toLocaleString()}`);
console.log(`   节律模式: ${r2.selectedMode} (饥饿时复习)\n`);

// 5️⃣ 第三次复习 - 用户忘记了
console.log("5️⃣ 第三次复习 - 用户忘记了 ❌");
const r3 = handleReviewResult(noteId, false, "hard");
console.log(`   重置到: ${r3.nextStage} (NEW)`);
console.log(`   下次时间: ${r3.nextDate?.toLocaleString()}`);
console.log(`   节律模式: ${r3.selectedMode} (饥饿时重新学习)\n`);

// 6️⃣ 查看打卡历史
console.log("6️⃣ 打卡历史:");
const history = getNoteReviewHistory(noteId);
history.forEach((log, i) => {
  console.log(`   ${i+1}. ${log.review_date} - ${log.remembered ? '✅ 记住' : '❌ 忘记'} (从 Step${log.fromStep}）`);
});

// 7️⃣ 查看统计
console.log("\n7️⃣ 统计数据:");
const stats = getReviewStats();
console.table({
  总复习次数: stats.totalReviews,
  记住: stats.rememberedCount,
  忘记: stats.forgottenCount,
  "正确率(%)": stats.accuracyRate.toFixed(2)
});
```

---

### 📋 常用命令速查表

```javascript
// 导入
import { 
  handleReviewResult, 
  runFullTest, 
  resetNoteProgress, 
  getNoteReviewHistory,
  getReviewStats 
} from '/lib/reviewHandler';

import { 
  addNote, 
  getDB, 
  getReviewQueue,
  getTodayReviews,
  submitReview 
} from '/lib/db';

// 快速命令
runFullTest();                           // 运行全量测试
handleReviewResult(id, true, "hard");    // 打卡
resetNoteProgress(id);                   // 重置单个
getNoteReviewHistory(id);                // 查看历史
getReviewStats();                        // 查看统计
getDB();                                 // 获取完整数据库
getReviewQueue();                        // 今日复习队列
```

---

### ⚠️ 故障排除

**Q: 打卡后没有看到变化？**
- A: 检查浏览器 Console 是否有错误提示
- 确保卡片 ID 正确
- 检查 localStorage 数据是否被清空

**Q: 重置逻辑不生效？**
- A: 确保调用了 `resetNoteProgress(id)` 而不是其他函数
- 查看打卡日志是否已清除：`getNoteReviewHistory(id).length === 0`

**Q: 测试函数失败？**
- A: 运行 `runFullTest()` 查看详细的错误信息
- 检查 localStorage 是否满
- 尝试清空本地数据后重试

---

### 🎬 实际流程（React 中）

```tsx
// 在你的番茄钟或复习页面
import { handleReviewResult } from '@/lib/reviewHandler';

export default function ReviewCard({ note }) {
  const [difficulty, setDifficulty] = useState('normal');

  const handleSuccess = () => {
    const result = handleReviewResult(
      note.id,
      true,  // 记住了
      difficulty
    );
    // 显示升级动画或提示
    alert(`转到 ${result.nextStage}！下次 ${result.nextDate}`);
  };

  const handleFail = () => {
    const result = handleReviewResult(
      note.id,
      false,  // 忘记了
      difficulty
    );
    // 显示重置提示
    alert(`已重置为 NEW，将在 ${result.nextDate} 重新复习`);
  };

  return (
    <div>
      {/* 难度选择器 */}
      <select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
        <option value="easy">简单</option>
        <option value="normal">普通</option>
        <option value="hard">困难</option>
      </select>

      {/* 打卡按钮 */}
      <button onClick={handleSuccess}>✅ 记住了</button>
      <button onClick={handleFail}>❌ 忘记了</button>
    </div>
  );
}
```

---

### 📚 相关文件

- **核心逻辑**：[lib/reviewHandler.ts](lib/reviewHandler.ts)
- **数据库**：[lib/db.ts](lib/db.ts)
- **SRS 算法**：[lib/srs.ts](lib/srs.ts)
- **集成示例**：[lib/integrationExamples.ts](lib/integrationExamples.ts)
- **详细文档**：[REVIEW_HANDLER_GUIDE.md](REVIEW_HANDLER_GUIDE.md)

---

### ✅ 验收清单

- [ ] 运行 `runFullTest()` 通过所有步骤
- [ ] 打卡后看到状态升级
- [ ] 忘记后回到 NEW 阶段
- [ ] 难度不同时节律模式不同
- [ ] 统计数据正确显示
- [ ] 重置逻辑生效
- [ ] 在番茄钟页面集成打卡
