import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getStoreSettings } from "@/lib/storefront";

export const dynamic = "force-dynamic";

export default async function StorefrontLayout({ children }: LayoutProps<"/">) {
  const settings = await getStoreSettings();
  return (
    <>
      <SiteHeader storeName={settings.storeName} />
      {children}
      <SiteFooter settings={settings} />
    </>
  );
}
