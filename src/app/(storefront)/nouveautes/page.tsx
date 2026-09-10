import type { Metadata } from "next";
import { CollectionPage } from "@/components/storefront/collection-page";
import { getStoreSettings } from "@/lib/storefront";
export async function generateMetadata(): Promise<Metadata> { const settings = await getStoreSettings(); const canonical = settings.siteUrl ? `${settings.siteUrl}/nouveautes` : undefined; return { title: "Nouveautés", description: "Les dernières nouveautés mode et chaussures de Ben Ami Shop.", alternates: canonical ? { canonical } : undefined, openGraph: { title: "Nouveautés", url: canonical } }; }
export default function Page() { return <CollectionPage eyebrow="Derniers arrivages" title="Nouveautés" description="Les pièces récemment ajoutées à notre sélection." where={{ isNew: true }} empty="Aucune nouveauté pour le moment" />; }
