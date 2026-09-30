"use client";

import {
  CheckIcon,
  CloudUploadIcon,
  HardDriveIcon,
  LoaderIcon,
  PlugZapIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { migrateToS3Action, testStorageAction } from "@/app/admin/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { SiteSettings } from "@/lib/settings";

import { Row, Section } from "./settings-ui";

type Storage = SiteSettings["storage"];
type S3 = Storage["s3"];
type Step = { label: string; ok: boolean; detail?: string };

const EASE = [0.16, 1, 0.3, 1] as const;

const PRESETS: {
  name: string;
  region: string;
  pathStyle: boolean;
  endpoint: string;
  tip: string;
}[] = [
  {
    name: "Garage",
    region: "garage",
    pathStyle: true,
    endpoint: "http://garage:3900",
    tip: "Region 与 garage.toml 中的 s3_region 一致（默认 garage）。Garage 不支持公开读的存储桶策略：要么用 website 模式绑定域名后填为公开地址，要么留空由博客转发。",
  },
  {
    name: "Cloudflare R2",
    region: "auto",
    pathStyle: true,
    endpoint: "https://<ACCOUNT_ID>.r2.cloudflarestorage.com",
    tip: "公开地址填存储桶绑定的自定义域名，或开启 r2.dev 后的地址。",
  },
  {
    name: "MinIO",
    region: "us-east-1",
    pathStyle: true,
    endpoint: "http://minio:9000",
    tip: "公开地址形如 https://minio.example.com/<bucket>，需要把存储桶设为公开读。",
  },
  {
    name: "阿里云 OSS",
    region: "oss-cn-hangzhou",
    pathStyle: false,
    endpoint: "https://oss-cn-hangzhou.aliyuncs.com",
    tip: "OSS 只支持虚拟主机风格，请关闭路径风格；公开地址填 Bucket 域名或绑定的 CDN 域名。",
  },
  {
    name: "腾讯云 COS",
    region: "ap-guangzhou",
    pathStyle: false,
    endpoint: "https://cos.ap-guangzhou.myqcloud.com",
    tip: "Bucket 名称带 APPID（如 blog-1250000000），请关闭路径风格；公开地址填默认域名或 CDN 域名。",
  },
  {
    name: "AWS S3",
    region: "us-east-1",
    pathStyle: false,
    endpoint: "https://s3.us-east-1.amazonaws.com",
    tip: "Region 与存储桶所在区域一致；公开访问建议通过 CloudFront。",
  },
];

export function StorageSettings({
  value,
  onChange,
  hasSecret,
  localCount,
  s3Count,
  dirty,
}: {
  value: Storage;
  onChange: (storage: Storage) => void;
  hasSecret: boolean;
  localCount: number;
  s3Count: number;
  /** 表单有未保存的修改（迁移使用已保存的配置） */
  dirty: boolean;
}) {
  const router = useRouter();
  const [tip, setTip] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [removeLocal, setRemoveLocal] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const s3 = value.s3;
  const setS3 = (patch: Partial<S3>) => onChange({ ...value, s3: { ...s3, ...patch } });
  const showConfig = value.driver === "s3" || s3Count > 0;

  async function test() {
    setTesting(true);
    setSteps(null);
    const res = await testStorageAction(s3);
    setTesting(false);
    if (!res.ok) return void toast.error(res.error);
    setSteps(res.data);
  }

  async function migrate() {
    const total = localCount;
    setErrors([]);
    setProgress({ done: 0, total });
    let afterId = 0;
    let done = 0;
    const failed: string[] = [];
    for (;;) {
      const res = await migrateToS3Action(afterId, removeLocal);
      if (!res.ok) {
        toast.error(res.error);
        break;
      }
      done += res.data.migrated;
      failed.push(...res.data.failed);
      afterId = res.data.lastId;
      setProgress({ done, total });
      if (res.data.done) break;
    }
    setErrors(failed);
    setProgress(null);
    if (done) toast.success(`已迁移 ${done} 个文件`);
    if (failed.length) toast.error(`${failed.length} 个文件迁移失败`);
    router.refresh();
  }

  const drivers = [
    { key: "local" as const, label: "本地磁盘", icon: HardDriveIcon },
    { key: "s3" as const, label: "S3 兼容存储", icon: CloudUploadIcon },
  ];

  return (
    <Section
      id="storage"
      title="存储"
      description="上传的图片与附件存放在哪里。文章中的地址不受影响，切换存储不需要修改文章。"
    >
      <Row label="新文件存放到" hint="已上传的文件位置不变，可用下方工具迁移">
        <div className="flex w-fit rounded-xl border border-border p-1 text-sm">
          {drivers.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => onChange({ ...value, driver: d.key })}
              aria-pressed={value.driver === d.key}
              className="relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5"
            >
              {value.driver === d.key && (
                <motion.span
                  layoutId="storage-driver"
                  className="absolute inset-0 rounded-lg bg-muted"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <d.icon className="relative size-4" />
              <span className="relative">{d.label}</span>
            </button>
          ))}
        </div>
      </Row>

      <AnimatePresence initial={false}>
        {showConfig && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="grid gap-5">
              {value.driver === "local" && s3Count > 0 && (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  有 {s3Count} 个文件存放在 S3，请保留下面的配置，否则这些文件将无法访问。
                </p>
              )}
              <Row label="常见服务" hint="填入推荐的 Region 与路径风格">
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => {
                        setS3({
                          region: p.region,
                          forcePathStyle: p.pathStyle,
                          endpoint: s3.endpoint || p.endpoint,
                        });
                        setTip(p.tip);
                      }}
                      className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                {tip && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{tip}</p>}
              </Row>
              <Row label="Endpoint" hint="S3 接口地址，不含存储桶名">
                <Input
                  value={s3.endpoint}
                  onChange={(e) => setS3({ endpoint: e.target.value })}
                  placeholder="https://s3.example.com"
                  className="font-mono text-xs"
                />
              </Row>
              <Row label="Region / Bucket">
                <div className="flex gap-2">
                  <Input
                    value={s3.region}
                    onChange={(e) => setS3({ region: e.target.value })}
                    placeholder="auto"
                    className="w-40 font-mono text-xs"
                  />
                  <Input
                    value={s3.bucket}
                    onChange={(e) => setS3({ bucket: e.target.value })}
                    placeholder="存储桶名称"
                    className="font-mono text-xs"
                  />
                </div>
              </Row>
              <Row label="Access Key">
                <Input
                  value={s3.accessKeyId}
                  onChange={(e) => setS3({ accessKeyId: e.target.value })}
                  autoComplete="off"
                  className="font-mono text-xs"
                />
              </Row>
              <Row label="Secret Key">
                <Input
                  type="password"
                  value={s3.secretAccessKey}
                  onChange={(e) => setS3({ secretAccessKey: e.target.value })}
                  placeholder={hasSecret ? "已设置，留空则不修改" : ""}
                  autoComplete="new-password"
                  className="font-mono text-xs"
                />
              </Row>
              <Row label="路径前缀" hint="可选，例如 blog/，与其他用途共用存储桶时使用">
                <Input
                  value={s3.prefix}
                  onChange={(e) => setS3({ prefix: e.target.value })}
                  placeholder="blog/"
                  className="font-mono text-xs"
                />
              </Row>
              <Row label="路径风格" hint="Garage、MinIO、R2 开启；阿里云、腾讯云关闭">
                <Switch
                  checked={s3.forcePathStyle}
                  onCheckedChange={(v) => setS3({ forcePathStyle: v })}
                />
              </Row>
              <Row
                label="公开访问地址"
                hint="CDN 或自定义域名，图片将直接从这里加载；留空时由博客服务器转发"
              >
                <Input
                  value={s3.publicUrl}
                  onChange={(e) => setS3({ publicUrl: e.target.value })}
                  placeholder="https://img.example.com"
                  className="font-mono text-xs"
                />
              </Row>

              <Row label="测试连接" hint="写入、读取并删除一个测试文件">
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={test}
                    disabled={testing}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-60"
                  >
                    {testing ? (
                      <LoaderIcon className="size-3.5 animate-spin" />
                    ) : (
                      <PlugZapIcon className="size-3.5" />
                    )}
                    测试
                  </button>
                  <AnimatePresence>
                    {steps && (
                      <motion.ul
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="space-y-1.5 rounded-xl border border-border p-3 text-sm"
                      >
                        {steps.map((step, i) => (
                          <motion.li
                            key={step.label}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.06, duration: 0.3, ease: EASE }}
                            className="flex gap-2"
                          >
                            {step.ok ? (
                              <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <XIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                            )}
                            <span>
                              {step.label}
                              {step.detail && (
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  {step.detail}
                                </span>
                              )}
                            </span>
                          </motion.li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              </Row>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {value.driver === "s3" && localCount > 0 && (
        <Row label="迁移本地文件" hint="把已上传到本地的文件搬到 S3，文章无需修改">
          <div className="space-y-3 rounded-xl border border-border p-4">
            <p className="text-sm">
              本地还有 <span className="font-medium tabular-nums">{localCount}</span> 个文件。
            </p>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={removeLocal} onCheckedChange={(v) => setRemoveLocal(v === true)} />
              迁移成功后删除本地副本
            </label>
            {progress ? (
              <div className="space-y-1.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-brand"
                    animate={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                    transition={{ duration: 0.4, ease: EASE }}
                  />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {progress.done} / {progress.total}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={migrate}
                disabled={dirty}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm text-background hover:opacity-90 disabled:opacity-40"
              >
                <CloudUploadIcon className="size-3.5" />
                开始迁移
              </button>
            )}
            {dirty && !progress && (
              <p className="text-xs text-subtle">请先保存设置，迁移会使用已保存的配置。</p>
            )}
            {errors.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-destructive">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        </Row>
      )}
    </Section>
  );
}
