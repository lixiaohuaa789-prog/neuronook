"use client";

import { useEffect, useRef, useState } from "react";
import { getDB, addNote, type StudyDB } from "../lib/db";

/**
 * 调试面板组件
 * 用于在开发阶段快速模拟复习场景和时间跨度
 */
export function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const messageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  const showMessage = (msg: string, duration = 3000) => {
    if (messageTimerRef.current) {
      window.clearTimeout(messageTimerRef.current);
    }
    setMessage(msg);
    messageTimerRef.current = window.setTimeout(() => {
      setMessage(null);
      messageTimerRef.current = null;
    }, duration);
  };

  // 添加测试笔记
  const handleAddTestNote = () => {
    setLoading(true);
    try {
      const testNotes = [
        {
          front: "什么是海马体?",
          content: "海马体是大脑中负责短期记忆转化为长期记忆的关键结构，位于颞叶内侧。通过LTP机制实现记忆巩固。",
          subject: "生物",
        },
        {
          front: "中国的首都是?",
          content: "北京，位于中国北部，是中国的政治、经济、科技和文化中心。",
          subject: "地理",
        },
        {
          front: "什么是光合作用?",
          content: "植物利用光能，将二氧化碳和水转化为葡萄糖等有机物，释放氧气的过程。",
          subject: "生物",
        },
        {
          front: "牛顿第一运动定律",
          content: "物体不受外力作用时，将保持匀速直线运动或静止的状态。这是惯性定律。",
          subject: "物理",
        },
        {
          front: "什么是GDP?",
          content: "国内生产总值，是一个国家在一定时期内生产的所有最终产品和服务的市场价值总和。",
          subject: "经济",
        },
      ];

      // 随机选择一个测试笔记
      const randomNote = testNotes[Math.floor(Math.random() * testNotes.length)];
      addNote({
        front: randomNote.front,
        content: randomNote.content,
        subject: randomNote.subject,
      });

      showMessage(
        `✅ 已添加测试笔记: "${randomNote.front}" [${randomNote.subject}]`
      );
    } catch (error) {
      showMessage(`❌ 添加笔记失败: ${error}`);
    } finally {
      setLoading(false);
      // 触发事件让其他组件刷新
      window.dispatchEvent(new CustomEvent("study-app-changed"));
    }
  };

  // 时间推演：将所有复习卡片的 next_review 向后推一天
  const handleSimulateNextDay = () => {
    setLoading(true);
    try {
      const db = getDB();
      if (!db || db.reviews.length === 0) {
        showMessage("⚠️ 没有复习卡片可以推演");
        setLoading(false);
        return;
      }

      // 将所有复习卡片的 next_review 时间向后推一天
      const updatedReviews = db.reviews.map((review) => {
        const nextReviewDate = new Date(review.nextReviewTime);
        nextReviewDate.setDate(nextReviewDate.getDate() + 1);
        return {
          ...review,
          nextReviewTime: nextReviewDate.getTime(),
          next_review: nextReviewDate.toISOString(),
        };
      });

      // 更新 localStorage
      const updatedDB: StudyDB = {
        ...db,
        reviews: updatedReviews,
      };

      localStorage.setItem("study_app_data", JSON.stringify(updatedDB));

      const affectedCount = db.reviews.filter((r) => r.next_review).length;
      showMessage(
        `✅ 时间已推演一天！${affectedCount} 张卡片的复习时间已后移 24 小时`
      );

      // 触发事件让其他组件刷新
      window.dispatchEvent(new CustomEvent("study-app-changed"));
    } catch (error) {
      showMessage(`❌ 时间推演失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // 显示统计信息
  const getStats = () => {
    const db = getDB();
    if (!db) return { notes: 0, reviews: 0, logs: 0 };
    return {
      notes: db.notes?.length || 0,
      reviews: db.reviews?.length || 0,
      logs: db.reviewLogs?.length || 0,
    };
  };

  const stats = getStats();

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* 调试面板悬浮按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-12 h-12 rounded-full shadow-lg transition-all
          flex items-center justify-center text-xl font-bold
          ${
            isOpen
              ? "bg-red-500 text-white"
              : "bg-gray-800 text-yellow-300 hover:bg-gray-900"
          }
        `}
        title="系统调试面板"
      >
        🐛
      </button>

      {/* 调试面板展开内容 */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 bg-gray-900 border-2 border-yellow-400 rounded-lg shadow-2xl p-4 w-80 text-white">
          {/* 标题 */}
          <div className="mb-4 pb-3 border-b border-yellow-400">
            <h3 className="text-yellow-300 font-bold flex items-center gap-2">
              🐛 系统调试面板
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              用于测试跨天复习逻辑和时间推演
            </p>
          </div>

          {/* 统计信息 */}
          <div className="mb-4 p-3 bg-gray-800 rounded text-sm">
            <p className="text-gray-300">
              📚 笔记: <span className="text-green-400 font-bold">{stats.notes}</span>
            </p>
            <p className="text-gray-300">
              📋 复习: <span className="text-blue-400 font-bold">{stats.reviews}</span>
            </p>
            <p className="text-gray-300">
              📊 日志: <span className="text-purple-400 font-bold">{stats.logs}</span>
            </p>
          </div>

          {/* 按钮组 */}
          <div className="space-y-2 mb-4">
            {/* 添加测试笔记按钮 */}
            <button
              onClick={handleAddTestNote}
              disabled={loading}
              className={`
                w-full px-4 py-2 rounded font-semibold text-sm
                transition-all flex items-center justify-center gap-2
                ${
                  loading
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700 text-white active:bg-green-800"
                }
              `}
            >
              {loading ? "⏳" : "✨"} 添加测试笔记
            </button>

            {/* 时间推演按钮 */}
            <button
              onClick={handleSimulateNextDay}
              disabled={loading}
              className={`
                w-full px-4 py-2 rounded font-semibold text-sm
                transition-all flex items-center justify-center gap-2
                ${
                  loading
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white active:bg-blue-800"
                }
              `}
            >
              {loading ? "⏳" : "⏰"} 推演下一天
            </button>

            {/* 清空所有数据按钮 */}
            <button
              onClick={() => {
                if (
                  confirm(
                    "⚠️ 确定要清空所有笔记、复习记录和日志吗？此操作不可撤销！"
                  )
                ) {
                  localStorage.removeItem("study_app_data");
                  showMessage("✅ 所有数据已清空");
                  window.dispatchEvent(new CustomEvent("study-app-changed"));
                  setIsOpen(false);
                }
              }}
              className="
                w-full px-4 py-2 rounded font-semibold text-sm
                bg-red-600 hover:bg-red-700 text-white active:bg-red-800
                transition-all
              "
            >
              🗑️ 清空所有数据
            </button>
          </div>

          {/* 消息提示 */}
          {message && (
            <div className="p-3 bg-yellow-900 border border-yellow-600 rounded text-sm text-yellow-200">
              {message}
            </div>
          )}

          {/* 帮助文本 */}
          <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-400">
            <p>💡 快速使用：</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>添加几条笔记</li>
              <li>点击"推演下一天"向后移动复习时间</li>
              <li>返回首页观察复习队列变化</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
