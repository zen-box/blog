import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/admin-page";
import { MusicManager } from "@/components/admin/music-manager";
import { getMusicConfig, listMusic } from "@/server/music";
export const metadata: Metadata = { title: "音乐" };
export default function AdminMusicPage() {
  return (
    <AdminPage
      title="音乐"
      description="陪伴阅读的轻音乐。读者点击才会播放，进入页面不会下载任何音频。"
    >
      <MusicManager initial={listMusic()} config={getMusicConfig()} />
    </AdminPage>
  );
}
