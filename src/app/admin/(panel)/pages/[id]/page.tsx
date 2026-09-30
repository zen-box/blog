import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PostEditor } from "@/components/admin/editor/post-editor";
import { getEditorPost } from "@/server/admin";

export const metadata: Metadata = { title: "编辑页面" };

export default async function EditPageEditor({ params }: PageProps<"/admin/pages/[id]">) {
  const { id } = await params;
  const page = getEditorPost(Number(id), "page");
  if (!page) notFound();
  return <PostEditor key={page.id} initial={page} categories={[]} allTags={[]} />;
}
