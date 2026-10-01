"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { MusicConfig } from "@/lib/music";
import { Row, Section } from "./settings-ui";
export function MusicSettings({ initial }: { initial?: MusicConfig }) {
  const [config, setConfig] = useState<MusicConfig | null>(initial ?? null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    fetch("/api/admin/music", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "播放器设置读取失败");
        setConfig(data.config);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [initial]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "settings", config }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "播放器设置保存失败");
      setConfig(data.config);
      toast.success("播放器设置已保存");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section
      id="music"
      title="轻音乐播放器"
      description="音乐由读者主动播放，进入页面不会自动下载音频。文章内音频共用一个播放器。"
    >
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {config ? (
        <>
          <Row label="显示背景音乐入口">
            <Switch
              checked={config.enabled}
              onCheckedChange={(enabled) => setConfig({ ...config, enabled })}
            />
          </Row>
          <Row label="默认音量（%）" hint="建议保持较低音量；读者调节后记住个人音量。">
            <Input
              type="number"
              min={0}
              max={100}
              value={Math.round(config.defaultVolume * 100)}
              onChange={(event) =>
                setConfig({ ...config, defaultVolume: Number(event.target.value) / 100 })
              }
            />
          </Row>
          <Row label="手机端显示音乐入口">
            <Switch
              checked={config.showOnMobile}
              onCheckedChange={(showOnMobile) => setConfig({ ...config, showOnMobile })}
            />
          </Row>
          <div>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "保存中…" : "保存播放器设置"}
            </Button>
          </div>
        </>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          正在读取播放器设置…
        </p>
      )}
    </Section>
  );
}
