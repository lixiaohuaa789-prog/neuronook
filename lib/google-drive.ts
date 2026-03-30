const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_PROFILE_SCOPES = ["openid", "email", "profile"];
const GOOGLE_AUTH_SCOPE = [GOOGLE_DRIVE_SCOPE, ...GOOGLE_PROFILE_SCOPES].join(" ");
const GOOGLE_IDENTITY_SRC = "https://accounts.google.com/gsi/client";
const LEGACY_BACKUP_FILENAME = "brainynotes_backup.json";
const BACKUP_FOLDER_NAME = "StudyAppBackups";
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const BACKUP_PREFIX = "brainynotes_backup_";
const BACKUP_SUFFIX = ".json";
const DAILY_RETAIN_COUNT = 7;

export type BackupSnapshotType = "daily" | "manual";

type GoogleAccounts = {
  oauth2: {
    initTokenClient: (config: {
      client_id: string;
      scope: string;
      callback: (response: GoogleTokenResponse) => void;
    }) => {
      requestAccessToken: (overrides?: { prompt?: string }) => void;
    };
  };
};

declare global {
  interface Window {
    google?: {
      accounts?: GoogleAccounts;
    };
  }
}

export type GoogleAuthSession = {
  accessToken: string;
  expiresAtMs: number;
};

export type GoogleUserProfile = {
  email: string;
  name: string;
  picture?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  expires_in?: number;
};

function ensureGoogleIdentityLoaded(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("仅支持浏览器环境"));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_IDENTITY_SRC}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google 身份脚本加载失败")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google 身份脚本加载失败"));
    document.head.appendChild(script);
  });
}

export async function signInWithGoogle(clientId: string): Promise<GoogleAuthSession> {
  await ensureGoogleIdentityLoaded();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error("Google OAuth 初始化失败");
  }

  return requestGoogleToken(oauth2, clientId, { prompt: "consent" });
}

function requestGoogleToken(
  oauth2: GoogleAccounts["oauth2"],
  clientId: string,
  overrides?: { prompt?: string }
): Promise<GoogleAuthSession> {
  return new Promise((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_AUTH_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error || "Google 授权失败"));
          return;
        }
        resolve({
          accessToken: response.access_token,
          expiresAtMs: Date.now() + ((response.expires_in ?? 3600) * 1000),
        });
      },
    });

    tokenClient.requestAccessToken(overrides);
  });
}

export async function getGoogleProfile(accessToken: string): Promise<GoogleUserProfile> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error("无法获取 Google 账号信息");
  }
  const data = await res.json();
  return {
    email: data.email || "",
    name: data.name || data.email || "Google 用户",
    picture: data.picture,
  };
}

type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
};

type ParsedBackupFile = {
  file: DriveFile;
  type: BackupSnapshotType;
  timestampKey: string;
};

async function readGoogleApiError(res: Response, fallbackMessage: string): Promise<Error> {
  try {
    const data = await res.json();
    const message = data?.error?.message || data?.error_description || fallbackMessage;
    return new Error(`${fallbackMessage}（${res.status}）：${message}`);
  } catch {
    const text = await res.text().catch(() => "");
    const suffix = text ? `：${text.slice(0, 160)}` : "";
    return new Error(`${fallbackMessage}（${res.status}）${suffix}`);
  }
}

async function findFirstFile(accessToken: string, rawQuery: string): Promise<DriveFile | null> {
  const query = encodeURIComponent(rawQuery);
  const fields = encodeURIComponent("files(id,name,modifiedTime)");
  const orderBy = encodeURIComponent("modifiedTime desc");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=${orderBy}&pageSize=1`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw await readGoogleApiError(res, "查询云端备份文件失败");
  }

  const data = await res.json();
  const files = Array.isArray(data.files) ? data.files : [];
  return files[0] ?? null;
}

async function listFiles(accessToken: string, rawQuery: string, pageSize = 200): Promise<DriveFile[]> {
  const query = encodeURIComponent(rawQuery);
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime)");
  const orderBy = encodeURIComponent("modifiedTime desc");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=${orderBy}&pageSize=${pageSize}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw await readGoogleApiError(res, "查询云端备份列表失败");
  }

  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

function formatDatePart(n: number): string {
  return String(n).padStart(2, "0");
}

function buildSnapshotFilename(type: BackupSnapshotType, now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = formatDatePart(now.getMonth() + 1);
  const dd = formatDatePart(now.getDate());
  const hh = formatDatePart(now.getHours());
  const mi = formatDatePart(now.getMinutes());
  const ss = formatDatePart(now.getSeconds());
  return `${BACKUP_PREFIX}${type}_${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}${BACKUP_SUFFIX}`;
}

function parseSnapshotFileName(name: string): ParsedBackupFile["type"] | null {
  if (!name.startsWith(BACKUP_PREFIX) || !name.endsWith(BACKUP_SUFFIX)) return null;
  const middle = name.slice(BACKUP_PREFIX.length, -BACKUP_SUFFIX.length);
  const type = middle.startsWith("daily_") ? "daily" : middle.startsWith("manual_") ? "manual" : null;
  return type;
}

function extractTimestampKey(name: string): string | null {
  const matched = name.match(/^brainynotes_backup_(daily|manual)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/);
  if (!matched) return null;
  return `${matched[2]}_${matched[3]}`;
}

function parseBackupFiles(files: DriveFile[]): ParsedBackupFile[] {
  const out: ParsedBackupFile[] = [];
  for (const file of files) {
    const type = parseSnapshotFileName(file.name);
    const timestampKey = extractTimestampKey(file.name);
    if (!type || !timestampKey) continue;
    out.push({ file, type, timestampKey });
  }
  return out;
}

async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw await readGoogleApiError(res, "删除历史备份失败");
  }
}

async function cleanupOldDailySnapshots(accessToken: string, folderId: string): Promise<number> {
  const files = await listFiles(
    accessToken,
    `'${folderId}' in parents and trashed=false and name contains '${BACKUP_PREFIX}'`
  );
  const parsed = parseBackupFiles(files);

  const daily = parsed
    .filter((x) => x.type === "daily")
    .sort((a, b) => b.timestampKey.localeCompare(a.timestampKey));

  const stale = daily.slice(DAILY_RETAIN_COUNT);
  for (const item of stale) {
    await deleteFile(accessToken, item.file.id);
  }

  return stale.length;
}

async function findBackupFolder(accessToken: string): Promise<DriveFile | null> {
  return findFirstFile(
    accessToken,
    `name='${BACKUP_FOLDER_NAME}' and mimeType='${DRIVE_FOLDER_MIME}' and trashed=false`
  );
}

async function createBackupFolder(accessToken: string): Promise<string> {
  const metadata = {
    name: BACKUP_FOLDER_NAME,
    mimeType: DRIVE_FOLDER_MIME,
  };

  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    throw await readGoogleApiError(res, "创建云端备份目录失败");
  }

  const data = await res.json();
  if (!data?.id) {
    throw new Error("创建云端备份目录失败：未返回文件夹 ID");
  }

  return data.id as string;
}

async function findOrCreateBackupFolder(accessToken: string): Promise<string> {
  const folder = await findBackupFolder(accessToken);
  if (folder?.id) return folder.id;
  return createBackupFolder(accessToken);
}

async function findLatestSnapshotFile(accessToken: string, folderId: string): Promise<DriveFile | null> {
  const files = await listFiles(
    accessToken,
    `'${folderId}' in parents and trashed=false and name contains '${BACKUP_PREFIX}'`
  );
  const parsed = parseBackupFiles(files).sort((a, b) => b.timestampKey.localeCompare(a.timestampKey));
  return parsed[0]?.file ?? null;
}

async function findLegacyBackupFileAnywhere(accessToken: string): Promise<DriveFile | null> {
  return findFirstFile(accessToken, `name='${LEGACY_BACKUP_FILENAME}' and trashed=false`);
}

async function createBackupFile(accessToken: string, folderId: string, filename: string): Promise<string> {
  const metadata = {
    name: filename,
    mimeType: "application/json",
    parents: [folderId],
    appProperties: {
      source: "study-app",
      type: "backup",
    },
  };

  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    throw await readGoogleApiError(res, "创建云端备份文件失败");
  }

  const data = await res.json();
  if (!data?.id) {
    throw new Error("创建云端备份文件失败：未返回文件 ID");
  }

  return data.id as string;
}

async function uploadFileContent(accessToken: string, fileId: string, json: string) {
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: json,
  });

  if (!res.ok) {
    throw await readGoogleApiError(res, "上传备份内容失败");
  }
}

export async function uploadBackupJson(
  accessToken: string,
  json: string,
  snapshotType: BackupSnapshotType = "manual"
): Promise<{ fileId: string; filename: string; deletedDailyCount: number }> {
  const folderId = await findOrCreateBackupFolder(accessToken);
  const filename = buildSnapshotFilename(snapshotType);
  const fileId = await createBackupFile(accessToken, folderId, filename);
  await uploadFileContent(accessToken, fileId, json);
  const deletedDailyCount = await cleanupOldDailySnapshots(accessToken, folderId);
  return { fileId, filename, deletedDailyCount };
}

export async function downloadBackupJson(accessToken: string): Promise<string> {
  const folderId = await findOrCreateBackupFolder(accessToken);
  const file = (await findLatestSnapshotFile(accessToken, folderId)) ?? (await findLegacyBackupFileAnywhere(accessToken));
  if (!file) {
    throw new Error("云端未找到备份文件");
  }

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw await readGoogleApiError(res, "下载备份失败");
  }

  return res.text();
}

export function getDriveScope() {
  return GOOGLE_DRIVE_SCOPE;
}

export function getBackupFolderName() {
  return BACKUP_FOLDER_NAME;
}
