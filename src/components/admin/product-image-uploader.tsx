"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { ImageInput } from "@/types/product";

type UploadResponse = { images?: ImageInput[]; error?: string };

export function ProductImageUploader({ initialImages, configured }: { initialImages: ImageInput[]; configured: boolean }) {
  const [images, setImages] = useState(initialImages);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const move = (index: number, direction: -1 | 1) => setImages((current) => {
    const next = [...current]; const target = index + direction;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  const makePrimary = (index: number) => setImages((current) => { const next = [...current]; const [selected] = next.splice(index, 1); next.unshift(selected); return next; });

  const upload = (files: FileList | null) => {
    if (!files?.length || !configured) return;
    if (files.length > 8) { setError("Vous pouvez téléverser jusqu’à 8 images à la fois."); return; }
    setUploading(true); setProgress(0); setError(null);
    const body = new FormData(); Array.from(files).forEach((file) => body.append("files", file));
    const request = new XMLHttpRequest(); request.open("POST", "/api/admin/product-images");
    request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onload = () => {
      let response: UploadResponse = {};
      try { response = JSON.parse(request.responseText) as UploadResponse; } catch { response = {}; }
      if (request.status >= 200 && request.status < 300 && response.images) setImages((current) => [...current, ...response.images!]);
      else setError(response.error ?? "Le téléversement a échoué.");
      setUploading(false); if (inputRef.current) inputRef.current.value = "";
    };
    request.onerror = () => { setError("Connexion interrompue pendant le téléversement."); setUploading(false); };
    request.send(body);
  };

  const remove = async (image: ImageInput) => {
    setError(null);
    if (image.token) {
      setRemovingId(image.id);
      try {
        const response = await fetch("/api/admin/product-images", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: image.token }) });
        if (!response.ok) { const data = await response.json() as UploadResponse; throw new Error(data.error); }
      } catch (caught) {
        setError(caught instanceof Error && caught.message ? caught.message : "La suppression a échoué."); setRemovingId(null); return;
      }
      setRemovingId(null);
    }
    setImages((current) => current.filter((item) => item.id !== image.id));
  };

  return <div className="image-manager">
    <input type="hidden" name="images" value={JSON.stringify(images.map((image) => ({ id: image.id, token: image.token })))} />
    {images.length ? <ul className="image-list">{images.map((image, index) => <li key={image.id}>
      <div className="image-preview"><Image src={image.url} alt={image.alt || "Image produit"} fill sizes="140px" /></div>
      <div><strong>{index === 0 ? "Image principale" : `Image ${index + 1}`}</strong><span>{image.alt || "Sans texte alternatif"}</span></div>
      <div className="image-controls"><button type="button" disabled={index === 0} onClick={() => makePrimary(index)}>Principale</button><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Déplacer vers la gauche">←</button><button type="button" disabled={index === images.length - 1} onClick={() => move(index, 1)} aria-label="Déplacer vers la droite">→</button><button type="button" disabled={removingId === image.id} onClick={() => void remove(image)}>{removingId === image.id ? "Suppression…" : "Retirer"}</button></div>
    </li>)}</ul> : null}
    <div className="upload-zone" data-disabled={!configured || undefined}>
      <span aria-hidden="true">↑</span><strong>{configured ? "Ajouter des images" : "Téléversement indisponible"}</strong>
      <p>{configured ? "JPG, PNG, WebP, GIF ou AVIF · 8 Mo maximum par image · 8 images par envoi" : "Configurez Cloudinary pour activer l’ajout d’images."}</p>
      <input ref={inputRef} className="sr-only" id="product-images" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple disabled={!configured || uploading} onChange={(event) => upload(event.target.files)} />
      <button type="button" disabled={!configured || uploading} onClick={() => inputRef.current?.click()}>{uploading ? `Téléversement… ${progress}%` : "Choisir des images"}</button>
      {uploading ? <div className="upload-progress" role="progressbar" aria-label="Progression du téléversement" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div> : null}
      {error ? <p className="upload-error" role="alert">{error}</p> : null}
    </div>
  </div>;
}
