import type { Metadata } from "next";

import { PostEditor } from "@/components/admin/editor/post-editor";
import { editorOptions, emptyEditorPost } from "@/server/admin";

export const metadata: Metadata = { title: "写文章" };

export default function NewPostPage() {
  const { categories, allTags } = editorOptions();
  return <PostEditor initial={emptyEditorPost("post")} categories={categories} allTags={allTags} />;
}
