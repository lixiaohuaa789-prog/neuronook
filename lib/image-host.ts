const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export function isCloudinaryConfigured() {
  return Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET);
}

export async function compressImageFile(file: File): Promise<Blob> {
  if (typeof window === "undefined") {
    return file;
  }

  const maxSide = 1600;
  const quality = 0.78;

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  if (width > maxSide || height > maxSide) {
    if (width >= height) {
      height = Math.round((height * maxSide) / width);
      width = maxSide;
    } else {
      width = Math.round((width * maxSide) / height);
      height = maxSide;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? file),
      outputType,
      outputType === "image/jpeg" ? quality : undefined
    );
  });
}

export async function uploadImageToCloudinary(file: File): Promise<string | null> {
  if (!isCloudinaryConfigured()) {
    return null;
  }

  const optimizedBlob = await compressImageFile(file);
  const uploadFile = new File([optimizedBlob], file.name || `note-${Date.now()}.jpg`, {
    type: optimizedBlob.type || file.type || "image/jpeg",
  });

  const formData = new FormData();
  formData.append("file", uploadFile);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET as string);
  formData.append("folder", "study-app-notes");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`云端图片上传失败（${res.status}）${text ? `: ${text.slice(0, 160)}` : ""}`);
  }

  const data = await res.json();
  if (typeof data?.secure_url !== "string" || !data.secure_url) {
    throw new Error("云端图片上传失败：未返回图片地址");
  }

  return data.secure_url;
}
