"use client";

import { useEffect, useRef, useState } from "react";

import { archiveProductAction } from "@/actions/products";

export function ArchiveProductButton({ productId, productName }: { productId: string; productName: string }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const action = archiveProductAction.bind(null, productId);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button className="table-action danger" type="button" onClick={() => setOpen(true)}>Archiver</button>
      {open ? (
        <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby={`archive-${productId}`} aria-describedby={`archive-description-${productId}`} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div>
            <p className="eyebrow">Confirmation</p><h2 id={`archive-${productId}`}>Archiver ce produit ?</h2>
            <p id={`archive-description-${productId}`}>« {productName} » ne sera plus considéré comme publié. Vous pourrez le restaurer depuis sa fiche.</p>
            <div><button type="button" autoFocus onClick={() => setOpen(false)}>Annuler</button><form action={action}><button className="danger-solid" type="submit">Archiver</button></form></div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
