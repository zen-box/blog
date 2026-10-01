import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/admin-page";
import { MusicManager } from "@/components/admin/music-manager";
import { getMusicConfig, listMusic } from "@/server/music";
export const metadata: Metadata = { title: "音乐" };
export default function AdminMusicPage() {
  return (
    <AdminPage title="音乐" description="为阅读添一点轻音乐。管理播放列表、歌词、来源与授权署名。">
      <MusicManager initial={listMusic()} config={getMusicConfig()} />
    </AdminPage>
  );
}
