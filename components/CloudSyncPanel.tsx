"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Cloud } from "lucide-react";
import { SafeTextButton } from "./SafeTextButton";
import {
  buildBackupPayload,
  restoreFromBackupPayload,
  type BackupPayload,
  type RestoreMode,
} from "../lib/db";
import {
  downloadBackupJson,
  getBackupFolderName,
  getDriveScope,
  getGoogleProfile,
  signInWithGoogle,
  uploadBackupJson,
  type GoogleAuthSession,
  type GoogleUserProfile,
} from "../lib/google-drive";

type SyncStatus = {
  type: "success" | "error";
  message: string;
} | null;

const RECOMMENDED_BACKUP_SIZE_BYTES = 8 * 1024 * 1024;
const GOOGLE_AUTH_STORAGE_KEY = "study-app.google-auth";

type PersistedGoogleAuth = {
  session: GoogleAuthSession;
  profile: GoogleUserProfile;
};

export interface CloudSyncPanelProps {
  compact?: boolean;
}

function isBackupPayload(data: unknown): data is BackupPayload {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  const versionOk = obj.version === 1 || obj.version === 2;
  return versionOk && !!obj.db && typeof obj.exportedAt === "string";
}

export function CloudSyncPanel({ compact = false }: CloudSyncPanelProps) {
  const [session, setSession] = useState<GoogleAuthSession | null>(null);
  const [profile, setProfile] = useState<GoogleUserProfile | null>(null);
  const [status, setStatus] = useState<SyncStatus>(null);
  const [loading, setLoading] = useState<"connect" | "backup" | "restore" | "import-local" | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("overwrite");
  const [open, setOpen] = useState(!compact);
  const [preferNativeFileInput, setPreferNativeFileInput] = useState(false);
  const [estimatedBytes, setEstimatedBytes] = useState(0);
  const [storageMetrics, setStorageMetrics] = useState<{
    appBytes: number;
    usageBytes: number | null;
    quotaBytes: number | null;
  }>({ appBytes: 0, usageBytes: null, quotaBytes: null });
  const localImportInputRef = useRef<HTMLInputElement | null>(null);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  const isConnected = !!session && !!profile;
  const isClientIdMissing = !clientId;

  const subtitle = useMemo(() => {
    if (isClientIdMissing) {
      return "请先配置 NEXT_PUBLIC_GOOGLE_CLIENT_ID";
    }
    if (!isConnected) {
      return "仅请求 drive.file 权限，无法访问你的其他网盘文件";
    }
    return `已连接：${profile?.email || profile?.name}`;
  }, [isClientIdMissing, isConnected, profile]);

  const showStatus = (next: SyncStatus) => {
    setStatus(next);
    window.setTimeout(() => setStatus(null), 2800);
  };

  const clearConnection = () => {
    setSession(null);
    setProfile(null);
    window.localStorage.removeItem(GOOGLE_AUTH_STORAGE_KEY);
  };

  const isSessionExpired = (candidate: GoogleAuthSession) => candidate.expiresAtMs <= Date.now();

  useEffect(() => {
    if (!compact) {
      setOpen(true);
      return;
    }
    if (loading || status) {
      setOpen(true);
    }
  }, [compact, loading, status]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    const maxTouchPoints = navigator.maxTouchPoints || 0;
    const isIOS = /iPad|iPhone|iPod/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
    if (isIOS) setPreferNativeFileInput(true);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GOOGLE_AUTH_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<PersistedGoogleAuth>;
      const nextSession = parsed.session;
      const nextProfile = parsed.profile;
      if (!nextSession || !nextProfile || typeof nextSession.accessToken !== "string" || typeof nextSession.expiresAtMs !== "number") {
        window.localStorage.removeItem(GOOGLE_AUTH_STORAGE_KEY);
        return;
      }

      if (isSessionExpired(nextSession)) {
        window.localStorage.removeItem(GOOGLE_AUTH_STORAGE_KEY);
        return;
      }

      setSession(nextSession);
      setProfile(nextProfile as GoogleUserProfile);
    } catch {
      window.localStorage.removeItem(GOOGLE_AUTH_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!session || !profile) {
      window.localStorage.removeItem(GOOGLE_AUTH_STORAGE_KEY);
      return;
    }

    if (isSessionExpired(session)) {
      clearConnection();
      return;
    }

    const payload: PersistedGoogleAuth = { session, profile };
    window.localStorage.setItem(GOOGLE_AUTH_STORAGE_KEY, JSON.stringify(payload));
  }, [profile, session]);

  useEffect(() => {
    const calcEstimate = () => {
      try {
        const payload = buildBackupPayload();
        const bytes = new Blob([JSON.stringify(payload)]).size;
        setEstimatedBytes(bytes);
      } catch {
        setEstimatedBytes(0);
      }
    };

    calcEstimate();
    window.addEventListener("study-app-changed", calcEstimate);
    return () => window.removeEventListener("study-app-changed", calcEstimate);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const calcStorageMetrics = async () => {
      let appBytes = 0;
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (!key) continue;
          if (!key.startsWith("study_app_data") && key !== GOOGLE_AUTH_STORAGE_KEY) continue;
          const value = window.localStorage.getItem(key) ?? "";
          appBytes += new Blob([key, value]).size;
        }
      } catch {
        appBytes = 0;
      }

      let usageBytes: number | null = null;
      let quotaBytes: number | null = null;
      try {
        if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
          const estimate = await navigator.storage.estimate();
          usageBytes = typeof estimate.usage === "number" ? estimate.usage : null;
          quotaBytes = typeof estimate.quota === "number" ? estimate.quota : null;
        }
      } catch {
        usageBytes = null;
        quotaBytes = null;
      }

      if (cancelled) return;
      setStorageMetrics({ appBytes, usageBytes, quotaBytes });
    };

    void calcStorageMetrics();
    window.addEventListener("study-app-changed", calcStorageMetrics);
    window.addEventListener("storage", calcStorageMetrics);
    return () => {
      cancelled = true;
      window.removeEventListener("study-app-changed", calcStorageMetrics);
      window.removeEventListener("storage", calcStorageMetrics);
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const storageUsageRatio = useMemo(() => {
    if (storageMetrics.quotaBytes && storageMetrics.quotaBytes > 0 && storageMetrics.usageBytes != null) {
      return Math.max(0, Math.min(1, storageMetrics.usageBytes / storageMetrics.quotaBytes));
    }
    return null;
  }, [storageMetrics]);

  const buildLocalExportFilename = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return `brainynotes_local_${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}.json`;
  };

  const handleLocalExport = () => {
    try {
      const payload = buildBackupPayload();
      const text = JSON.stringify(payload, null, 2);
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const filename = buildLocalExportFilename();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showStatus({ type: "success", message: `已下载本地备份 ${filename}` });
    } catch (error) {
      showStatus({ type: "error", message: error instanceof Error ? error.message : "本地导出失败" });
    }
  };

  const handleLocalImportClick = () => {
    if (loading) return;
    const input = localImportInputRef.current;
    if (!input) return;

    // Reset value first so selecting the same file still fires change.
    input.value = "";

    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") {
      try {
        pickerInput.showPicker();
        return;
      } catch {
        // Fallback to click for browsers that block showPicker.
      }
    }

    input.click();
  };

  const handleLocalImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 允许重复选择同一个文件触发 change。
    event.target.value = "";
    if (!file) return;

    setLoading("import-local");
    try {
      const raw = await (typeof file.text === "function"
        ? file.text()
        : new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(new Error("读取本地文件失败，请重试"));
            reader.readAsText(file, "utf-8");
          }));
      const parsed = JSON.parse(raw) as unknown;
      if (!isBackupPayload(parsed)) {
        throw new Error("本地文件格式不受支持，请选择由系统导出的备份 JSON");
      }

      const stats = parsed.meta?.stats;
      const previewNotes = typeof stats?.noteCount === "number" ? stats.noteCount : parsed.db.notes.length;
      const previewReviews = typeof stats?.reviewCount === "number" ? stats.reviewCount : parsed.db.reviews.length;
      const previewSize = typeof stats?.totalBytesize === "number" ? stats.totalBytesize : file.size;
      const ok = window.confirm(
        `即将从本地文件恢复\n文件: ${file.name}\n笔记: ${previewNotes} 条\n复习记录: ${previewReviews} 条\n备份大小: ${formatBytes(previewSize)}\n\n是否继续？`
      );
      if (!ok) {
        showStatus({ type: "error", message: "已取消导入" });
        return;
      }

      const result = restoreFromBackupPayload(parsed, restoreMode);
      showStatus({
        type: "success",
        message: `导入完成：${result.notes} 条笔记 / ${result.reviews} 条复习记录`,
      });
    } catch (error) {
      showStatus({ type: "error", message: error instanceof Error ? error.message : "本地导入失败" });
    } finally {
      setLoading(null);
    }
  };

  const handleConnect = async () => {
    if (isClientIdMissing) {
      showStatus({ type: "error", message: "缺少 Google Client ID 配置" });
      return;
    }

    setLoading("connect");
    try {
      const nextSession = await signInWithGoogle(clientId);
      const nextProfile = await getGoogleProfile(nextSession.accessToken);
      setSession(nextSession);
      setProfile(nextProfile);
      showStatus({ type: "success", message: "Google 账号连接成功" });
    } catch (error) {
      showStatus({ type: "error", message: error instanceof Error ? error.message : "连接失败" });
    } finally {
      setLoading(null);
    }
  };

  const handleBackup = async () => {
    if (!session) {
      showStatus({ type: "error", message: "请先连接 Google 账号" });
      return;
    }

    if (isSessionExpired(session)) {
      clearConnection();
      showStatus({ type: "error", message: "Google 登录已过期，请重新连接" });
      return;
    }

    setLoading("backup");
    try {
      const payload = buildBackupPayload();
      const payloadJson = JSON.stringify(payload);
      const payloadBytes = new Blob([payloadJson]).size;
      setEstimatedBytes(payloadBytes);

      if (payloadBytes > RECOMMENDED_BACKUP_SIZE_BYTES) {
        const shouldContinue = window.confirm(
          `当前备份约 ${formatBytes(payloadBytes)}，可能上传较慢或失败。\n建议先压缩图片后再备份。\n是否继续？`
        );
        if (!shouldContinue) {
          showStatus({ type: "error", message: "已取消备份" });
          return;
        }
      }

      const result = await uploadBackupJson(session.accessToken, payloadJson, "manual");
      const cleanupHint = result.deletedDailyCount > 0 ? `，已清理 ${result.deletedDailyCount} 个旧 daily 快照` : "";
      showStatus({ type: "success", message: `已生成快照 ${result.filename}${cleanupHint}` });
    } catch (error) {
      const sizeHint = estimatedBytes > 0 ? `（当前约 ${formatBytes(estimatedBytes)}）` : "";
      showStatus({
        type: "error",
        message: error instanceof Error ? `${error.message}${sizeHint}` : `备份失败${sizeHint}`,
      });
    } finally {
      setLoading(null);
    }
  };

  const handleRestore = async () => {
    if (!session) {
      showStatus({ type: "error", message: "请先连接 Google 账号" });
      return;
    }

    if (isSessionExpired(session)) {
      clearConnection();
      showStatus({ type: "error", message: "Google 登录已过期，请重新连接" });
      return;
    }

    const preConfirm = window.confirm(
      `即将从云端恢复并${restoreMode === "overwrite" ? "覆盖" : "合并"}本地数据。\n\n是否继续？`
    );
    if (!preConfirm) {
      showStatus({ type: "error", message: "已取消恢复" });
      return;
    }

    setLoading("restore");
    try {
      const raw = await downloadBackupJson(session.accessToken);
      const parsed = JSON.parse(raw) as unknown;
      if (!isBackupPayload(parsed)) {
        throw new Error("备份文件格式不受支持");
      }

      const stats = parsed.meta?.stats;
      const previewNotes = typeof stats?.noteCount === "number" ? stats.noteCount : parsed.db.notes.length;
      const previewReviews = typeof stats?.reviewCount === "number" ? stats.reviewCount : parsed.db.reviews.length;

      const result = restoreFromBackupPayload(parsed, restoreMode);
      showStatus({
        type: "success",
        message: `恢复完成：${result.notes} 条笔记 / ${result.reviews} 条复习记录（备份含 ${previewNotes} / ${previewReviews}）`,
      });
    } catch (error) {
      showStatus({ type: "error", message: error instanceof Error ? error.message : "恢复失败" });
    } finally {
      setLoading(null);
    }
  };

  const content = (
    <div className={compact ? "mt-2 min-w-0 rounded-lg border border-gray-100 bg-white/90 p-2.5" : "min-w-0"}>
      {!compact && <h3 className="text-[0.78rem] font-semibold tracking-wide text-gray-700">云端同步</h3>}
      <p className={compact ? "text-[0.68rem] leading-relaxed text-gray-500 break-words" : "mt-1 text-[0.68rem] leading-relaxed text-gray-500 break-words"}>{subtitle}</p>
      <p className="mt-1 text-[0.64rem] text-gray-400 break-all">Scope: {getDriveScope()}</p>
      <p className="mt-1 text-[0.64rem] text-gray-400 break-words">目录: {getBackupFolderName()}</p>
      <p className="mt-1 text-[0.64rem] text-gray-400 break-words">预计大小: {formatBytes(estimatedBytes)}</p>
      <p className="mt-1 text-[0.64rem] text-gray-400 break-words">
        本地占用: {formatBytes(storageMetrics.appBytes)}
        {storageUsageRatio != null
          ? `（总占用 ${(storageUsageRatio * 100).toFixed(1)}%）`
          : "（总占用未知）"}
      </p>
      {storageUsageRatio != null && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={[
              "h-full transition-all",
              storageUsageRatio >= 0.8 ? "bg-rose-500" : storageUsageRatio >= 0.65 ? "bg-amber-500" : "bg-emerald-500",
            ].join(" ")}
            style={{ width: `${Math.max(3, storageUsageRatio * 100)}%` }}
            aria-hidden
          />
        </div>
      )}
      {estimatedBytes > RECOMMENDED_BACKUP_SIZE_BYTES && (
        <p className="mt-1 text-[0.64rem] text-amber-600 break-words">提示: 备份较大，建议压缩图片后再上传</p>
      )}

      {!isConnected ? (
        <div className="mt-3 space-y-2">
          <SafeTextButton
            onClick={handleConnect}
            disabled={loading === "connect" || isClientIdMissing}
            className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[0.75rem] font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === "connect" ? "连接中..." : "连接 Google 账号"}
          </SafeTextButton>
          <div className="grid grid-cols-2 gap-2">
            <SafeTextButton
              onClick={handleLocalExport}
              disabled={loading !== null}
              className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-[0.72rem] font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              💾 下载本地
            </SafeTextButton>
            <SafeTextButton
              onClick={handleLocalImportClick}
              disabled={loading !== null}
              className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-[0.72rem] font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading === "import-local" ? "导入中..." : "📤 上传本地"}
            </SafeTextButton>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className={compact ? "grid grid-cols-1 gap-2" : "grid grid-cols-2 gap-2"}>
            <SafeTextButton
              onClick={handleBackup}
              disabled={loading === "backup" || loading === "restore"}
              className={[
                "rounded-lg border border-gray-200 bg-white px-2 py-2 font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60",
                compact ? "text-[0.74rem]" : "text-[0.72rem]",
              ].join(" ")}
            >
              {loading === "backup" ? "备份中..." : "⬆️ 备份到云端"}
            </SafeTextButton>
            <SafeTextButton
              onClick={handleRestore}
              disabled={loading === "backup" || loading === "restore"}
              className={[
                "rounded-lg border border-gray-200 bg-white px-2 py-2 font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60",
                compact ? "text-[0.74rem]" : "text-[0.72rem]",
              ].join(" ")}
            >
              {loading === "restore" ? "恢复中..." : "⬇️ 从云端恢复"}
            </SafeTextButton>
          </div>

          <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2"}>
            <SafeTextButton
              onClick={handleLocalExport}
              disabled={loading !== null}
              className={["rounded-lg border border-gray-200 bg-white px-2 py-2 font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60", compact ? "text-[0.74rem]" : "text-[0.72rem]"].join(" ")}
            >
              💾 下载本地
            </SafeTextButton>

            <SafeTextButton
              onClick={handleLocalImportClick}
              disabled={loading !== null}
              className={["rounded-lg border border-gray-200 bg-white px-2 py-2 font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60", compact ? "text-[0.74rem]" : "text-[0.72rem]"].join(" ")}
            >
              {loading === "import-local" ? "导入中..." : "📤 上传本地"}
            </SafeTextButton>
          </div>

          <div className="flex items-center gap-2 text-[0.66rem] text-gray-500">
            <label htmlFor="restoreMode" className="font-medium text-gray-600">恢复模式</label>
            <select
              id="restoreMode"
              value={restoreMode}
              onChange={(e) => setRestoreMode(e.target.value as RestoreMode)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[0.66rem] text-gray-700"
            >
              <option value="overwrite">覆盖本地</option>
              <option value="merge">合并到本地</option>
            </select>
          </div>
        </div>
      )}

      {preferNativeFileInput && (
        <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/70 p-2">
          <p className="mb-1 text-[0.64rem] text-blue-700 break-words">iPad 建议直接使用下方文件选择器导入本地备份</p>
          <input
            ref={localImportInputRef}
            type="file"
            accept=".json,application/json,text/json,text/plain,*/*"
            disabled={loading !== null}
            onChange={handleLocalImportFile}
            className="block w-full rounded-md border border-blue-200 bg-white px-2 py-1.5 text-[0.72rem] text-gray-700 file:mr-2 file:rounded-md file:border-0 file:bg-blue-100 file:px-2 file:py-1 file:text-[0.7rem] file:font-medium file:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      )}

      {!preferNativeFileInput && (
        <input
          ref={localImportInputRef}
          type="file"
          accept=".json,application/json,text/json,text/plain,*/*"
          className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0"
          onChange={handleLocalImportFile}
        />
      )}
    </div>
  );

  return (
    <section
      className={[
        compact
          ? "min-w-0 rounded-xl border border-transparent bg-transparent"
          : "min-w-0 rounded-xl border border-gray-200/80 bg-white/70 p-3 shadow-sm",
      ].join(" ")}
      aria-label="云端同步"
    >
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 hover:bg-gray-100/50"
          aria-expanded={open}
          aria-controls="cloud-sync-panel-content"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-all duration-200 group-hover:text-gray-700">
            <Cloud size={18} strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.88rem] font-medium leading-tight text-gray-500">云端同步</span>
            <span className="mt-0.5 block truncate text-[0.7rem] font-medium leading-tight text-gray-400 group-hover:text-gray-500">
              Google Drive 备份/恢复
            </span>
          </span>
          <ChevronDown
            size={16}
            className={[
              "text-gray-400 transition-transform duration-200",
              open ? "rotate-180" : "rotate-0",
            ].join(" ")}
          />
        </button>
      ) : null}

      {(!compact || open) && (
        <div id="cloud-sync-panel-content">{content}</div>
      )}

      {status && (
        <div
          className={[
            "fixed bottom-4 right-4 z-[90] rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg",
            status.type === "success" ? "bg-emerald-600" : "bg-rose-600",
          ].join(" ")}
          role="status"
          aria-live="polite"
        >
          {status.message}
        </div>
      )}
    </section>
  );
}
