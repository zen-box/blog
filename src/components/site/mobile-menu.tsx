"use client";

import { Dialog } from "@base-ui/react/dialog";
import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { isActivePath, type NavItem } from "./nav-links";

export function MobileMenu({ items, title }: { items: NavItem[]; title: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="打开菜单"
        className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground md:hidden"
      >
        <MenuIcon className="size-[1.15rem]" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Popup
          className={cn(
            "group/menu fixed inset-0 z-[70] flex flex-col bg-background/92 backdrop-blur-2xl outline-none",
            "transition-opacity duration-400 ease-out-expo data-ending-style:opacity-0 data-starting-style:opacity-0",
          )}
        >
          <Dialog.Title className="sr-only">{title} 导航</Dialog.Title>
          <div className="container-page flex h-(--header-h) items-center justify-end">
            <Dialog.Close
              aria-label="关闭菜单"
              className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <XIcon className="size-[1.15rem]" />
            </Dialog.Close>
          </div>
          <nav className="container-page mt-6 flex flex-col gap-1" aria-label="移动端导航">
            {items.map((item, i) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  style={{ transitionDelay: `${60 + i * 45}ms` }}
                  className={cn(
                    "flex items-baseline gap-4 py-3 font-serif text-[1.9rem] font-semibold tracking-wide",
                    "transition-[opacity,translate] duration-600 ease-out-expo",
                    "group-data-starting-style/menu:translate-y-5 group-data-starting-style/menu:opacity-0",
                    "group-data-ending-style/menu:opacity-0 group-data-ending-style/menu:[transition-delay:0ms]",
                    active ? "text-brand" : "text-foreground",
                  )}
                >
                  <span className="font-mono text-xs font-normal text-subtle">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
