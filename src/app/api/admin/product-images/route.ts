import { NextResponse } from "next/server";

import { createUploadToken, deleteProductImage, deleteProductImages, isSupportedImage, productImageLimits, uploadProductImage, verifyUploadToken } from "@/lib/cloudinary";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 30;

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export async function POST(request: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > productImageLimits.maxBytes * productImageLimits.maxFiles + 1024 * 1024) {
    return NextResponse.json({ error: "La taille totale du téléversement est trop importante." }, { status: 413 });
  }
  const uploadedIds: string[] = [];
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    if (!files.length || files.length > productImageLimits.maxFiles) return NextResponse.json({ error: `Sélectionnez entre 1 et ${productImageLimits.maxFiles} images.` }, { status: 400 });
    const images = [];
    for (const file of files) {
      if (!acceptedTypes.has(file.type) || file.size <= 0 || file.size > productImageLimits.maxBytes) throw new Error("INVALID_FILE");
      const buffer = Buffer.from(await file.arrayBuffer());
      if (!isSupportedImage(buffer)) throw new Error("INVALID_FILE");
      const image = await uploadProductImage(buffer);
      uploadedIds.push(image.publicId);
      images.push({ id: `pending-${crypto.randomUUID()}`, url: image.url, publicId: image.publicId, alt: file.name.replace(/\.[^.]+$/, "").slice(0, 160) || null, token: createUploadToken(image) });
    }
    return NextResponse.json({ images });
  } catch (error) {
    await deleteProductImages(uploadedIds);
    const invalid = error instanceof Error && error.message === "INVALID_FILE";
    return NextResponse.json({ error: invalid ? "Format invalide ou fichier supérieur à 8 Mo." : "Le téléversement a échoué. Réessayez." }, { status: invalid ? 415 : 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  try {
    const body = await request.json() as { token?: unknown };
    if (typeof body.token !== "string") return NextResponse.json({ error: "Image invalide." }, { status: 400 });
    const image = verifyUploadToken(body.token);
    if (!image) return NextResponse.json({ error: "Image invalide ou expirée." }, { status: 400 });
    const attachedImage = await prisma.productImage.findFirst({ where: { publicId: image.publicId }, select: { id: true } });
    if (attachedImage) return NextResponse.json({ error: "Cette image est déjà associée à un produit." }, { status: 409 });
    await deleteProductImage(image.publicId);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "La suppression a échoué." }, { status: 500 });
  }
}
