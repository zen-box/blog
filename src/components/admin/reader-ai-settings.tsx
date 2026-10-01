"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { ReaderAiConfig } from "@/lib/reader-ai";
import { Row, Section } from "./settings-ui";
export function ReaderAiSettings() {
  const [config, setConfig] = useState<ReaderAiConfig | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/reader-ai", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "阅读增强设置读取失败");
        setConfig(data.config);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, []);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/reader-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "settings", config }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "设置保存失败");
      setConfig(data.config);
      toast.success("阅读增强设置已保存");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section
      id="reader-ai"
      title="读者 AI 内容"
      description="摘要在后台提前生成，访客浏览不会调用 AI。自动生成默认关闭，开启后会使用已配置的主模型。"
    >
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {config ? (
        <>
          <Row label="启用阅读增强">
            <Switch
              checked={config.enabled}
              onCheckedChange={(enabled) => setConfig({ ...config, enabled })}
            />
          </Row>
          <Row label="发布或更新后自动生成摘要" hint="只处理正文变化；标题、标签等修改不重复生成。">
            <Switch
              checked={config.autoSummary}
              onCheckedChange={(autoSummary) => setConfig({ ...config, autoSummary })}
            />
          </Row>
          <Row label="显示 AI 摘要">
            <Switch
              checked={config.showSummary}
              onCheckedChange={(showSummary) => setConfig({ ...config, showSummary })}
            />
          </Row>
          <Row label="显示测评速览">
            <Switch
              checked={config.showBenchmark}
              onCheckedChange={(showBenchmark) => setConfig({ ...config, showBenchmark })}
            />
          </Row>
          <div>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "保存中…" : "保存阅读增强设置"}
            </Button>
          </div>
        </>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          正在读取阅读增强设置…
        </p>
      )}
    </Section>
  );
}
