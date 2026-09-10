import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

const folder = "ben-ami-shop/products";
const maxTokenAge = 24 * 60 * 60 * 1000;

export const productImageLimits = { maxBytes: 8 * 1024 * 1024, maxFiles: 8 } as const;

export type UploadedImage = {
  publicId: string;
  url: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
};

type UploadTokenPayload = UploadedImage & { issuedAt: number };

function requireConfiguration() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const authSecret = process.env.AUTH_SECRET;
  if (!cloudName || !apiKey || !apiSecret || !authSecret) throw new Error("Cloudinary configuration is incomplete.");
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return authSecret;
}

function signature(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createUploadToken(image: UploadedImage) {
  const secret = requireConfiguration();
  const encoded = Buffer.from(JSON.stringify({ ...image, issuedAt: Date.now() } satisfies UploadTokenPayload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyUploadToken(token: string): UploadedImage | null {
  try {
    const secret = requireConfiguration();
    const [encoded, supplied] = token.split(".");
    if (!encoded || !supplied) return null;
    const expected = signature(encoded, secret);
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as UploadTokenPayload;
    if (!payload.publicId.startsWith(`${folder}/`) || !payload.url.startsWith("https://res.cloudinary.com/") || Date.now() - payload.issuedAt > maxTokenAge) return null;
    return { publicId: payload.publicId, url: payload.url, format: payload.format, width: payload.width, height: payload.height, bytes: payload.bytes };
  } catch {
    return null;
  }
}

export async function uploadProductImage(buffer: Buffer): Promise<UploadedImage> {
  requireConfiguration();
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: "image", overwrite: false, unique_filename: true, tags: ["ben-ami-shop", "product-image"] }, (error, response) => {
      if (error || !response) reject(error ?? new Error("Cloudinary upload failed.")); else resolve(response);
    });
    stream.end(buffer);
  });
  return { publicId: result.public_id, url: result.secure_url, format: result.format, width: result.width, height: result.height, bytes: result.bytes };
}

export async function deleteProductImage(publicId: string) {
  requireConfiguration();
  if (!publicId.startsWith(`${folder}/`)) throw new Error("Invalid product asset.");
  await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
}

export async function deleteProductImages(publicIds: string[]) {
  await Promise.allSettled(publicIds.map((publicId) => deleteProductImage(publicId)));
}

export function isSupportedImage(buffer: Buffer) {
  const png = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const gif = buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a";
  const webp = buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  const avif = buffer.subarray(4, 12).toString("ascii").includes("ftypavif") || buffer.subarray(4, 12).toString("ascii").includes("ftypavis");
  return png || jpeg || gif || webp || avif;
}
