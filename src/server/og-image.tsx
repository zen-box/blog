import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import { DATA_DIR } from "@/db";
import { formatDate } from "@/lib/format";
import { getSettings } from "@/lib/settings";

import { readUpload } from "./storage";

/** 改了版式就加一，旧缓存自动失效 */
const OG_VERSION = 1;
const CACHE_DIR = path.join(/*turbopackIgnore: true*/ DATA_DIR, "og-cache");

const PAPER = "#f7f4ee";
const INK = "#1f1d1a";
const MUTED = "#857d71";
const OCHRE = "#c9a15f";

// 字体只读一次；GB2312 子集，字重 600（见 assets/fonts/README.md）
let font: Promise<Buffer> | undefined;
const loadFont = () =>
  (font ??= fs.readFile(path.join(process.cwd(), "assets/fonts/NotoSerifSC-SemiBold.subset.woff")));

/** OKLCH 转 sRGB 十六进制；分享图用浅色主题的品牌色 */
function oklch(l: number, c: number, hue: number) {
  const h = (hue * Math.PI) / 180;
  const a = c * Math.cos(h),
    b = c * Math.sin(h);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return `#${rgb
    .map((v) => {
      const x = Math.min(1, Math.max(0, v));
      const s = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
      return Math.round(s * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

/** 站内上传的图片转成 data URI（统一转 JPEG/PNG，满足 Satori 的格式要求） */
async function uploadImage(
  url: string | null | undefined,
  width: number,
  height: number,
  png = false,
) {
  if (!url?.startsWith("/uploads/")) return null;
  try {
    const rel = decodeURIComponent(url.slice("/uploads/".length).split(/[?#]/)[0]);
    const { default: sharp } = await import("sharp");
    const image = sharp(await readUpload(rel), { failOn: "none" }).resize(width, height, {
      fit: "cover",
    });
    const data = png ? await image.png().toBuffer() : await image.jpeg({ quality: 82 }).toBuffer();
    return `data:image/${png ? "png" : "jpeg"};base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
}

async function cached(key: unknown[], render: () => Promise<ImageResponse>) {
  const name = createHash("sha256")
    .update(JSON.stringify([OG_VERSION, ...key]))
    .digest("hex");
  const file = path.join(/*turbopackIgnore: true*/ CACHE_DIR, `${name}.png`);
  try {
    return await fs.readFile(file);
  } catch {
    /* 第一次生成 */
  }
  const png = Buffer.from(await (await render()).arrayBuffer());
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(file, png);
  return png;
}

export function pngResponse(png: Buffer) {
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
    },
  });
}

function Brand({ logo, site, brand }: { logo: string | null; site: string; brand: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} width={44} height={44} style={{ borderRadius: 12 }} alt="" />
      ) : (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: brand,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
          }}
        >
          {site.slice(0, 1)}
        </div>
      )}
      <span style={{ marginLeft: 16, fontSize: 28, color: INK }}>{site}</span>
    </div>
  );
}

/** 文章分享图（1200×630）：有封面时左文右图，没有封面时用大标题和装饰圆 */
export async function postOgImage(post: {
  id: number;
  title: string;
  cover: string | null;
  category?: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
}) {
  const s = getSettings();
  const png = await cached(
    [
      "post",
      post.id,
      post.updatedAt.getTime(),
      post.title,
      post.cover,
      post.category,
      s.siteTitle,
      s.logo,
      s.accentHue,
    ],
    async () => {
      const brand = oklch(0.468, 0.097, s.accentHue);
      const soft = oklch(0.935, 0.018, s.accentHue);
      const [cover, logo, data] = await Promise.all([
        uploadImage(post.cover, 480, 518),
        uploadImage(s.logo, 88, 88, true),
        loadFont(),
      ]);
      const meta = [post.category, post.publishedAt ? formatDate(post.publishedAt) : ""]
        .filter(Boolean)
        .join(" · ");
      const size = post.title.length > 28 ? 48 : post.title.length > 16 ? 56 : 64;
      return new ImageResponse(
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            background: PAPER,
            padding: 56,
            fontFamily: "Noto Serif SC",
            position: "relative",
          }}
        >
          {/* 没有封面：右侧两个装饰圆（Satori 不认 Fragment 里的绝对定位，分开写并用 left/top） */}
          {!cover && (
            <div
              style={{
                position: "absolute",
                left: 800,
                top: -110,
                width: 520,
                height: 520,
                borderRadius: 9999,
                background: OCHRE,
                opacity: 0.22,
              }}
            />
          )}
          {!cover && (
            <div
              style={{
                position: "absolute",
                left: 700,
                top: 430,
                width: 380,
                height: 380,
                borderRadius: 9999,
                background: soft,
              }}
            />
          )}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              paddingRight: cover ? 48 : 220,
            }}
          >
            <Brand logo={logo} site={s.siteTitle} brand={brand} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              {meta && <span style={{ fontSize: 24, color: brand, marginBottom: 18 }}>{meta}</span>}
              <div
                style={{
                  fontSize: size,
                  lineHeight: 1.36,
                  color: INK,
                  lineClamp: 3,
                  display: "block",
                }}
              >
                {post.title}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ width: 56, height: 5, borderRadius: 3, background: brand }} />
              <span style={{ marginLeft: 18, fontSize: 22, color: MUTED }}>{s.authorName}</span>
            </div>
          </div>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              width={480}
              height={518}
              style={{ borderRadius: 28, objectFit: "cover" }}
              alt=""
            />
          )}
        </div>,
        {
          width: 1200,
          height: 630,
          fonts: [{ name: "Noto Serif SC", data, weight: 600, style: "normal" }],
        },
      );
    },
  );
  return png;
}

/** 首页等页面的默认分享图 */
export async function siteOgImage() {
  const s = getSettings();
  return cached(["site", s.siteTitle, s.siteDescription, s.logo, s.accentHue], async () => {
    const brand = oklch(0.468, 0.097, s.accentHue);
    const soft = oklch(0.935, 0.018, s.accentHue);
    const [logo, data] = await Promise.all([uploadImage(s.logo, 88, 88, true), loadFont()]);
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: 72,
          fontFamily: "Noto Serif SC",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -90,
            top: -120,
            width: 560,
            height: 560,
            borderRadius: 9999,
            background: OCHRE,
            opacity: 0.22,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 160,
            bottom: -200,
            width: 420,
            height: 420,
            borderRadius: 9999,
            background: soft,
          }}
        />
        <Brand logo={logo} site={s.siteTitle} brand={brand} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 76, color: INK }}>{s.siteTitle}</span>
          <span style={{ marginTop: 20, fontSize: 32, color: MUTED }}>{s.siteDescription}</span>
        </div>
        <div style={{ width: 64, height: 6, borderRadius: 3, background: brand }} />
      </div>,
      {
        width: 1200,
        height: 630,
        fonts: [{ name: "Noto Serif SC", data, weight: 600, style: "normal" }],
      },
    );
  });
}

/** 播客封面（1400×1400，Apple 播客要求的最小尺寸） */
export async function podcastCover() {
  const s = getSettings();
  return cached(["podcast", s.siteTitle, s.authorName, s.accentHue], async () => {
    const brand = oklch(0.468, 0.097, s.accentHue);
    const soft = oklch(0.935, 0.018, s.accentHue);
    const data = await loadFont();
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: brand,
          padding: 120,
          fontFamily: "Noto Serif SC",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -160,
            top: -160,
            width: 900,
            height: 900,
            borderRadius: 9999,
            background: OCHRE,
            opacity: 0.85,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 120,
            top: 120,
            width: 360,
            height: 360,
            borderRadius: 9999,
            background: soft,
            opacity: 0.18,
          }}
        />
        <span style={{ fontSize: 150, color: "#fff", lineHeight: 1.2 }}>{s.siteTitle}</span>
        <span style={{ marginTop: 36, fontSize: 64, color: soft }}>播客 · {s.authorName}</span>
      </div>,
      {
        width: 1400,
        height: 1400,
        fonts: [{ name: "Noto Serif SC", data, weight: 600, style: "normal" }],
      },
    );
  });
}
