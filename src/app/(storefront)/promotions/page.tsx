import type { Metadata } from "next";
import { CollectionPage } from "@/components/storefront/collection-page";
import { getStoreSettings } from "@/lib/storefront";
export async function generateMetadata(): Promise<Metadata> { const settings = await getStoreSettings(); const canonical = settings.siteUrl ? `${settings.siteUrl}/promotions` : undefined; return { title: "Promotions", description: "Découvrez les promotions actuelles de Ben Ami Shop.", alternates: canonical ? { canonical } : undefined, openGraph: { title: "Promotions", url: canonical } }; }
export default function Page() { return <CollectionPage eyebrow="Sélection à prix doux" title="Promotions" description="Nos offres actuellement disponibles, dans la limite des stocks." where={{ isOnSale: true }} empty="Aucune promotion en cours" />; }
