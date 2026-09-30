import { MailIcon, RssIcon } from "lucide-react";

import type { SiteSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

import { BrandIcon, type BrandIconName } from "./brand-icons";

type Item = { label: string; href: string; icon: React.ReactNode };

export function socialItems(social: SiteSettings["social"], withRss = true): Item[] {
  const brand = (name: BrandIconName) => <BrandIcon name={name} className="size-[1.05rem]" />;
  const items: Item[] = [];
  if (social.github)
    items.push({
      label: "GitHub",
      href: social.github.startsWith("http")
        ? social.github
        : `https://github.com/${social.github}`,
      icon: brand("github"),
    });
  if (social.twitter)
    items.push({
      label: "X",
      href: social.twitter.startsWith("http") ? social.twitter : `https://x.com/${social.twitter}`,
      icon: brand("x"),
    });
  if (social.bilibili)
    items.push({
      label: "哔哩哔哩",
      href: social.bilibili.startsWith("http")
        ? social.bilibili
        : `https://space.bilibili.com/${social.bilibili}`,
      icon: brand("bilibili"),
    });
  if (social.weibo) items.push({ label: "微博", href: social.weibo, icon: brand("weibo") });
  if (social.zhihu) items.push({ label: "知乎", href: social.zhihu, icon: brand("zhihu") });
  if (social.email)
    items.push({
      label: "邮箱",
      href: `mailto:${social.email}`,
      icon: <MailIcon className="size-[1.1rem]" />,
    });
  if (withRss)
    items.push({
      label: "RSS 订阅",
      href: "/feed.xml",
      icon: <RssIcon className="size-[1.05rem]" />,
    });
  return items;
}

export function SocialLinks({
  social,
  withRss,
  className,
}: {
  social: SiteSettings["social"];
  withRss?: boolean;
  className?: string;
}) {
  const items = socialItems(social, withRss);
  if (!items.length) return null;
  return (
    <ul className={cn("flex items-center gap-1", className)}>
      {items.map((item) => (
        <li key={item.label}>
          <a
            href={item.href}
            target={item.href.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer me"
            aria-label={item.label}
            title={item.label}
            className="grid size-9 place-items-center rounded-full text-muted-foreground transition-[color,background-color,transform] duration-300 ease-out-expo hover:-translate-y-0.5 hover:bg-foreground/[0.06] hover:text-foreground"
          >
            {item.icon}
          </a>
        </li>
      ))}
    </ul>
  );
}
