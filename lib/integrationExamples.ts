/**
 * 📚 集成示例：如何在番茄钟顶级完成时触发打卡逻辑
 * 
 * 场景：用户在番茄钟专注模式下复习完一张卡片，点击"记住"或"忘记"按钮
 */

import {
  handleReviewResult,
  runFullTest,
  resetNoteProgress,
  resetAllNotesProgress,
  getNoteReviewHistory,
  getReviewStats,
  type Difficulty,
} from "@/lib/reviewHandler";

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 场景 1：用户在番茄钟 Focus 模式下完成一张卡片的复习
// ═══════════════════════════════════════════════════════════════════════════

export function handlePomodoroCompleted(
  noteId: number,
  userMemorized: boolean,
  noteDifficulty: Difficulty = "normal"
) {
  try {
    const result = handleReviewResult(
      noteId,
      userMemorized, // true: 记住了, false: 忘记了
      noteDifficulty // "easy" | "normal" | "hard"
    );

    console.log("✅ 打卡成功", {
      nextStage: result.nextStage,
      nextDate: result.nextDate,
      rhythmMode: result.selectedMode,
    });

    return result;
  } catch (error) {
    console.error("❌ 打卡失败", error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧪 场景 2：全量测试 - 验证整个系统的状态流转是否正确
// ═══════════════════════════════════════════════════════════════════════════

export function runSystemTest() {
  console.log("🧪 开始全量测试...");
  const result = runFullTest();

  if (result.success) {
    console.log("✅ 全量测试通过！");
    console.table(result.testResults);
  } else {
    console.error("❌ 全量测试失败：", result.errors);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 场景 3：重置逻辑 - 重新学习某个已掌握的知识点
// ═══════════════════════════════════════════════════════════════════════════

export function handleResetNote(noteId: number) {
  console.log(`🔄 正在重置笔记 ID=${noteId}...`);
  try {
    resetNoteProgress(noteId);
    console.log(`✅ 笔记已重置为初始状态`);
  } catch (error) {
    console.error("❌ 重置失败", error);
    throw error;
  }
}

export function handleResetAll() {
  console.log("🧼 警告：即将重置所有笔记！");
  if (!confirm("确定要重置所有笔记吗？此操作不可撤销。")) {
    return;
  }

  try {
    const result = resetAllNotesProgress();
    console.log(`✅ 已重置 ${result.resetCount} 份笔记，清除 ${result.logsCleared} 条打卡记录`);
  } catch (error) {
    console.error("❌ 重置失败", error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 场景 4：查看统计数据
// ═══════════════════════════════════════════════════════════════════════════

export function displayReviewStats() {
  const stats = getReviewStats();
  console.log("📈 复习统计：", {
    总复习次数: stats.totalReviews,
    记住: stats.rememberedCount,
    忘记: stats.forgottenCount,
    正确率: `${stats.accuracyRate.toFixed(2)}%`,
  });
  return stats;
}

export function displayNoteHistory(noteId: number) {
  const history = getNoteReviewHistory(noteId);
  console.log(`📋 笔记 ID=${noteId} 的打卡历史：`, history);
  return history;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 React 组件集成示例
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 例如，在番茄钟或复习页面可以这样用：
 *
 * export default function ReviewCard({ note }) {
 *   const [difficulty, setDifficulty] = useState<Difficulty>("normal");
 *
 *   const handleRemembered = () => {
 *     const result = handleReviewResult(note.id, true, difficulty);
 *     // 显示下次复习时间或动画反馈
 *     showNotification(`升级到 ${result.nextStage}！下次 ${result.nextDate}`);
 *   };
 *
 *   const handleForgotten = () => {
 *     const result = handleReviewResult(note.id, false, difficulty);
 *     // 重新调度，显示反馈
 *     showNotification(`已重置为 NEW，需要重新学习...`);
 *   };
 *
 *   return (
 *     <div className="review-card">
 *       <h2>{note.front}</h2>
 *       <p>{note.content}</p>
 *
 *       <div className="difficulty-selector">
 *         <label>
 *           <input
 *             type="radio"
 *             value="easy"
 *             checked={difficulty === "easy"}
 *             onChange={(e) => setDifficulty(e.target.value as Difficulty)}
 *           />
 *           简单
 *         </label>
 *         <label>
 *           <input
 *             type="radio"
 *             value="normal"
 *             checked={difficulty === "normal"}
 *             onChange={(e) => setDifficulty(e.target.value as Difficulty)}
 *           />
 *           普通
 *         </label>
 *         <label>
 *           <input
 *             type="radio"
 *             value="hard"
 *             checked={difficulty === "hard"}
 *             onChange={(e) => setDifficulty(e.target.value as Difficulty)}
 *           />
 *           困难
 *         </label>
 *       </div>
 *
 *       <button onClick={handleRemembered}>✅ 记住了</button>
 *       <button onClick={handleForgotten}>❌ 忘记了</button>
 *     </div>
 *   );
 * }
 */
