import type { getStoreSettings } from "@/lib/storefront";
export type AwaitedStoreSettings = Awaited<ReturnType<typeof getStoreSettings>>;
