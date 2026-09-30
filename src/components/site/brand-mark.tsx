import { cn } from "@/lib/utils";

import { Seal } from "./seal";

export type BrandView = {
  title: string;
  logo: string | null;
  logoDark: string | null;
  showTitle: boolean;
};

/** 站点标识：上传了 Logo 时显示 Logo（可有暗色版本），否则显示站名首字印章 */
export function BrandMark({
  brand,
  className,
  sealClassName,
}: {
  brand: BrandView;
  /** Logo 图片的尺寸样式，默认高 28px */
  className?: string;
  sealClassName?: string;
}) {
  if (!brand.logo) return <Seal text={brand.title} className={sealClassName} />;
  const img = cn(
    "h-7 w-auto max-w-44 object-contain transition-opacity duration-300 group-hover/logo:opacity-80",
    className,
  );
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brand.logo}
        alt={brand.title}
        className={cn(img, brand.logoDark && "dark:hidden")}
      />
      {brand.logoDark && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoDark} alt={brand.title} className={cn(img, "hidden dark:block")} />
      )}
    </>
  );
}
