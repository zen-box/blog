import { Reveal } from "@/components/motion/reveal";
import type { PostListItem } from "@/server/posts";

import { PostCard } from "./post-card";

export function PostList({ posts }: { posts: PostListItem[] }) {
  return (
    <div className="-mx-3 flex flex-col gap-2 sm:-mx-4 sm:gap-3">
      {posts.map((post, i) => (
        <Reveal key={post.id} delay={Math.min(i, 6) * 0.06}>
          <PostCard post={post} priority={i < 2} />
        </Reveal>
      ))}
    </div>
  );
}
