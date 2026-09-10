import type { ProductStatus } from "@prisma/client";

export type ProductFormState = {
  success: boolean;
  message: string | null;
  errors: Record<string, string>;
};

export type VariantInput = {
  id?: string;
  size: string;
  color: string;
  stock: number;
};

export type ImageInput = {
  id: string;
  url: string;
  publicId: string | null;
  alt: string | null;
  token?: string;
};

export type ProductFormValues = {
  name: string;
  slug: string;
  reference: string;
  description: string;
  categoryId: string;
  brandId: string;
  color: string;
  price: string;
  oldPrice: string;
  status: ProductStatus;
  isNew: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  isOnSale: boolean;
  variants: VariantInput[];
  images: ImageInput[];
};
