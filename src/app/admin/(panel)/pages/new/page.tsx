import type { Metadata } from "next";

import { PostEditor } from "@/components/admin/editor/post-editor";
import { emptyEditorPost } from "@/server/admin";

export const metadata: Metadata = { title: "新建页面" };

export default function NewPageEditor() {
  return <PostEditor initial={emptyEditorPost("page")} categories={[]} allTags={[]} />;
}
