import { notFound, redirect } from "next/navigation";

import { HomeView } from "@/components/site/home-view";

export async function generateMetadata({ params }: PageProps<"/page/[page]">) {
  const { page } = await params;
  return { title: `第 ${page} 页`, alternates: { canonical: `/page/${page}` } };
}

export default async function PagedHome({ params }: PageProps<"/page/[page]">) {
  const { page } = await params;
  const n = Number(page);
  if (!Number.isInteger(n) || n < 1) notFound();
  if (n === 1) redirect("/");
  return <HomeView page={n} />;
}
