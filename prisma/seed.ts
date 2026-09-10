import { hash } from "bcryptjs";

import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  { name: "Chaussures", slug: "chaussures", order: 0 },
  { name: "Vêtements", slug: "vetements", order: 1 },
  { name: "Sport", slug: "sport", order: 2 },
  { name: "Classique", slug: "classique", order: 3 },
  { name: "Pantalons", slug: "pantalons", order: 4 },
  { name: "Chemises", slug: "chemises", order: 5 },
  { name: "T-shirts", slug: "t-shirts", order: 6 },
  { name: "Vestes", slug: "vestes", order: 7 },
  { name: "Accessoires", slug: "accessoires", order: 8 },
] as const;

const brands = [
  { name: "Nike", slug: "nike" },
  { name: "Adidas", slug: "adidas" },
  { name: "Puma", slug: "puma" },
  { name: "New Balance", slug: "new-balance" },
  { name: "Lacoste", slug: "lacoste" },
  { name: "Tommy Hilfiger", slug: "tommy-hilfiger" },
] as const;

const settings = [
  { key: "store_name", value: "Ben Ami Shop" },
  { key: "currency", value: "MAD" },
  { key: "whatsapp_number", value: "" },
  { key: "instagram_url", value: "" },
  { key: "store_address", value: "" },
  { key: "phone", value: "" },
  { key: "low_stock_threshold", value: "3" },
  { key: "site_url", value: "" },
] as const;

function requireSeedEnvironment() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required to run the seed.");
  }

  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
  }

  return { email, password };
}

async function main() {
  const { email, password } = requireSeedEnvironment();
  const passwordHash = await hash(password, 12);

  await prisma.$transaction([
    prisma.user.upsert({
      where: { email },
      update: { passwordHash, role: UserRole.ADMIN },
      create: {
        name: "Administrator",
        email,
        passwordHash,
        role: UserRole.ADMIN,
      },
    }),
    ...categories.map((category) =>
      prisma.category.upsert({
        where: { slug: category.slug },
        update: {
          name: category.name,
          order: category.order,
          isActive: true,
        },
        create: category,
      }),
    ),
    ...brands.map((brand) =>
      prisma.brand.upsert({
        where: { slug: brand.slug },
        update: { name: brand.name, isActive: true },
        create: brand,
      }),
    ),
    ...settings.map((setting) =>
      prisma.setting.upsert({
        where: { key: setting.key },
        // Existing merchant-managed values must never be reset by a later seed.
        update: {},
        create: setting,
      }),
    ),
  ]);

  console.info("Ben Ami Shop seed completed.");
}

main()
  .catch((error: unknown) => {
    console.error("Ben Ami Shop seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
