import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PostEditor } from "@/components/admin/editor/post-editor";
import { editorOptions, getEditorPost } from "@/server/admin";

export const metadata: Metadata = { title: "编辑文章" };

export default async function EditPostPage({ params }: PageProps<"/admin/posts/[id]">) {
  const { id } = await params;
  const post = getEditorPost(Number(id), "post");
  if (!post) notFound();
  const { categories, allTags } = editorOptions();
  return <PostEditor key={post.id} initial={post} categories={categories} allTags={allTags} />;
}
