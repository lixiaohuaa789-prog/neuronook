"use client";

import { useEffect, useState } from "react";
import { getStudyStats } from "../lib/db";

export function StatsStrip() {
  const [stats, setStats] = useState({
    noteCount: 0,
    dueCount: 0,
    streak: 0,
    masteredCount: 0,
  });

  useEffect(() => {
    const sync = () => setStats(getStudyStats());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("study-app-changed", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("study-app-changed", sync as EventListener);
    };
  }, []);

  return (
    <div className="stats-strip grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4" aria-label="学习概览">
      <div className="stat-card p-4 md:p-5">
        <span className="stat-value">{stats.noteCount}</span>
        <span className="stat-label">知识点</span>
      </div>
      <div className="stat-card stat-card-accent p-4 md:p-5">
        <span className="stat-value">{stats.dueCount}</span>
        <span className="stat-label">今日待复习</span>
      </div>
      <div className="stat-card stat-card-warm p-4 md:p-5">
        <span className="stat-value">{stats.streak}</span>
        <span className="stat-label">连续打卡</span>
      </div>
      <div className="stat-card stat-card-muted p-4 md:p-5">
        <span className="stat-value">{stats.masteredCount}</span>
        <span className="stat-label">已掌握</span>
      </div>
    </div>
  );
}
