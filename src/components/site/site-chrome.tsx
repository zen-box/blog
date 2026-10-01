import { MotionProvider } from "@/components/motion/motion-provider";
import { NavigationTracker } from "@/components/motion/navigation-state";
import { getSettings } from "@/lib/settings";
import { getPublicMusic } from "@/server/music";
import { MusicLauncher } from "@/components/music/music-launcher";

import { BackToTop } from "./back-to-top";
import { SiteFooter } from "./footer";
import { SiteHeader } from "./header";
import { PageTracker } from "./page-tracker";
import { SmoothScroll } from "./smooth-scroll";

/** 前台外框：页头、页脚、平滑滚动、访问统计 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const s = getSettings();
  const music = getPublicMusic();
  return (
    <MotionProvider>
      <div aria-hidden className="paper-grain" />
      <SiteHeader />
      <main className="min-h-[72vh]">{children}</main>
      <SiteFooter />
      <BackToTop />
      <MusicLauncher config={music.config} tracks={music.tracks} />
      <NavigationTracker />
      <PageTracker />
      {s.smoothScroll && <SmoothScroll />}
    </MotionProvider>
  );
}
