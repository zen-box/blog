"use client";

import {
  CheckIcon,
  KeyRoundIcon,
  LoaderIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useConfirm } from "./confirm";

export type CustomVoice = {
  id: string;
  name: string;
  sample: string;
  source: "design" | "upload";
  note: string;
};
export type TtsSettings = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  designModel: string;
  cloneModel: string;
  useProxy: boolean;
  narrator: { voice: string; style: string };
  hosts: { name: string; voice: string }[];
  podcastStyle: string;
  autoRefresh: boolean;
  voices: CustomVoice[];
};
export type BuiltinVoice = { id: string; name: string; note: string };
export type KeySource = "own" | "ai" | "none";

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "请求失败，请稍后重试");
  return data;
}

/** 同一时间只放一段试听 */
function usePreview() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const stop = () => {
    audio.current?.pause();
    setPlaying(null);
  };
  const play = (id: string, src: string) => {
    stop();
    const el = new Audio(src);
    audio.current = el;
    el.onended = () => setPlaying(null);
    void el.play().then(
      () => setPlaying(id),
      () => setPlaying(null),
    );
  };
  return { playing, loading, setLoading, play, stop };
}
type Preview = ReturnType<typeof usePreview>;

function PreviewButton({
  id,
  preview,
  onPreview,
  className,
}: {
  id: string;
  preview: Preview;
  onPreview: () => void;
  className?: string;
}) {
  const busy = preview.loading === id;
  const playing = preview.playing === id;
  return (
    <button
      type="button"
      aria-label={playing ? "停止试听" : "试听"}
      title={playing ? "停止试听" : "试听"}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        if (playing) preview.stop();
        else onPreview();
      }}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-60",
        playing && "border-brand/40 text-brand",
        className,
      )}
    >
      {busy ? (
        <LoaderIcon className="size-3 animate-spin" />
      ) : playing ? (
        <PauseIcon className="size-3" />
      ) : (
        <PlayIcon className="size-3 translate-x-px" />
      )}
    </button>
  );
}

const voiceLabel = (ref: string, builtin: readonly BuiltinVoice[], voices: CustomVoice[]) =>
  ref.startsWith("custom:")
    ? (voices.find((v) => `custom:${v.id}` === ref)?.name ?? "自定义音色")
    : (builtin.find((v) => v.id === ref)?.name ?? ref);

export function VoiceBlock({
  value,
  onChange,
  builtin,
  keySource,
  ownKey,
  onOwnKey,
  onVoices,
  ensureSaved,
}: {
  value: TtsSettings;
  onChange: (patch: Partial<TtsSettings>) => void;
  builtin: readonly BuiltinVoice[];
  keySource: KeySource;
  /** 单独的密钥输入：null 表示不改动 */
  ownKey: string | null;
  onOwnKey: (key: string | null) => void;
  /** 自定义音色变化（设计、上传、删除）会立即保存 */
  onVoices: (voices: CustomVoice[]) => void;
  /** 试听前先保存未保存的设置（例如刚填的密钥） */
  ensureSaved: () => Promise<boolean>;
}) {
  const preview = usePreview();
  const confirm = useConfirm();
  const [designOpen, setDesignOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const options = [
    ...builtin.map((v) => ({ value: v.id, label: `${v.name} · ${v.note}` })),
    ...value.voices.map((v) => ({ value: `custom:${v.id}`, label: `${v.name} · 自定义` })),
  ];

  async function sample(id: string, voice: string, style: string) {
    if (!(await ensureSaved())) return;
    preview.setLoading(id);
    try {
      const data = await postJson("/api/admin/tts", { op: "preview", voice, style });
      preview.play(id, `data:audio/wav;base64,${data.audio}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      preview.setLoading(null);
    }
  }

  async function removeVoice(voice: CustomVoice) {
    if (!(await confirm({ title: `删除音色「${voice.name}」？`, confirmText: "删除" }))) return;
    try {
      const data = await postJson("/api/admin/tts", { op: "deleteVoice", id: voice.id });
      onVoices(data.config.voices);
      onChange({ narrator: data.config.narrator, hosts: data.config.hosts });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const cards = [
    ...builtin.filter((v) => !/^[A-Z]/.test(v.id)),
    ...value.voices.map((v) => ({
      id: `custom:${v.id}`,
      name: v.name,
      note: v.source === "design" ? "自定义 · 音色设计" : "自定义 · 本人录音",
    })),
  ];

  return (
    <div className="space-y-7">
      {/* 密钥 */}
      <div>
        <p className="text-sm text-foreground">密钥</p>
        {keySource === "ai" && ownKey === null ? (
          <div className="mt-2 flex h-9 items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 text-sm">
            <KeyRoundIcon className="size-3.5 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 truncate">AI 助手也是 MiMo，沿用它的 API Key</span>
            <button
              type="button"
              onClick={() => onOwnKey("")}
              className="text-xs text-brand hover:opacity-80"
            >
              单独设置
            </button>
          </div>
        ) : keySource === "own" && ownKey === null ? (
          <div className="mt-2 flex h-9 items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 text-sm">
            <KeyRoundIcon className="size-3.5 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 truncate">已保存语音服务的密钥 · 只保存在服务器</span>
            <button
              type="button"
              onClick={() => onOwnKey("")}
              className="text-xs text-brand hover:opacity-80"
            >
              更换
            </button>
          </div>
        ) : (
          <div className="mt-2 flex gap-2">
            <Input
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              aria-label="语音服务密钥"
              value={ownKey ?? ""}
              onChange={(e) => onOwnKey(e.target.value)}
              placeholder="MiMo 的 API Key（sk-…）"
              className="font-mono text-[13px] [font-variant-ligatures:none]"
            />
            {keySource !== "none" && (
              <button
                type="button"
                onClick={() => onOwnKey(null)}
                className="h-8 shrink-0 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                取消
              </button>
            )}
          </div>
        )}
        {keySource === "none" && ownKey === null && (
          <p className="mt-2 text-xs text-muted-foreground">
            还没有密钥。AI 助手换成 MiMo 后会自动沿用它的密钥。
          </p>
        )}
      </div>

      {/* 朗读 */}
      <div>
        <p className="text-sm text-foreground">朗读的声音</p>
        <p className="mt-0.5 text-xs text-muted-foreground">文章朗读用这个声音，点 ▶ 试听</p>
        <div
          role="radiogroup"
          aria-label="朗读的声音"
          className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4"
        >
          {cards.map((voice) => {
            const active = value.narrator.voice === voice.id;
            return (
              <div
                key={voice.id}
                role="radio"
                aria-checked={active}
                tabIndex={0}
                onClick={() => onChange({ narrator: { ...value.narrator, voice: voice.id } })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onChange({ narrator: { ...value.narrator, voice: voice.id } });
                  }
                }}
                className={cn(
                  "relative flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-brand/60 bg-brand/[0.06] ring-1 ring-brand/30"
                    : "border-border hover:border-foreground/20 hover:bg-muted/40",
                )}
              >
                <PreviewButton
                  id={`n-${voice.id}`}
                  preview={preview}
                  onPreview={() => void sample(`n-${voice.id}`, voice.id, value.narrator.style)}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">{voice.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {voice.note}
                  </span>
                </span>
                {active && (
                  <CheckIcon className="absolute top-2 right-2 size-3.5 text-brand" aria-hidden />
                )}
              </div>
            );
          })}
        </div>
        <label className="mt-4 block text-xs text-muted-foreground" htmlFor="tts-style">
          朗读风格（用一句话描述语气、语速）
        </label>
        <Textarea
          id="tts-style"
          rows={2}
          maxLength={500}
          value={value.narrator.style}
          onChange={(e) => onChange({ narrator: { ...value.narrator, style: e.target.value } })}
          className="mt-1.5 min-h-0 text-sm"
        />
      </div>

      {/* 播客 */}
      <div>
        <p className="text-sm text-foreground">播客主播</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          AI 按这两个名字写对话稿，分别用各自的声音合成
        </p>
        <div className="mt-3 space-y-2.5">
          {value.hosts.map((host, index) => (
            <div key={index} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-xs font-medium",
                  index === 0 ? "bg-brand-soft text-brand" : "bg-ochre/15 text-ochre",
                )}
              >
                {index === 0 ? "A" : "B"}
              </span>
              <Input
                aria-label={`主播 ${index + 1} 的名字`}
                value={host.name}
                maxLength={8}
                onChange={(e) =>
                  onChange({
                    hosts: value.hosts.map((h, i) =>
                      i === index ? { ...h, name: e.target.value } : h,
                    ),
                  })
                }
                className="w-28"
              />
              <Select
                items={options}
                value={host.voice}
                onValueChange={(voice) =>
                  voice &&
                  onChange({
                    hosts: value.hosts.map((h, i) => (i === index ? { ...h, voice } : h)),
                  })
                }
              >
                <SelectTrigger className="min-w-0 flex-1" aria-label={`主播 ${index + 1} 的声音`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <PreviewButton
                id={`h-${index}`}
                preview={preview}
                onPreview={() => void sample(`h-${index}`, host.voice, value.podcastStyle)}
              />
            </div>
          ))}
        </div>
        <label className="mt-4 block text-xs text-muted-foreground" htmlFor="tts-podcast-style">
          播客的整体氛围
        </label>
        <Textarea
          id="tts-podcast-style"
          rows={2}
          maxLength={500}
          value={value.podcastStyle}
          onChange={(e) => onChange({ podcastStyle: e.target.value })}
          className="mt-1.5 min-h-0 text-sm"
        />
      </div>

      {/* 自定义音色 */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-foreground">自定义音色</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              先用一句话设计出满意的样音，再以它为样本克隆，每段的声音都一致；也可以上传本人录音
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDesignOpen(true)}>
              <SparklesIcon />
              设计音色
            </Button>
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
              <MicIcon />
              上传本人录音
            </Button>
          </div>
        </div>
        {value.voices.length > 0 ? (
          <ul className="mt-3 divide-y divide-border/70 rounded-xl border border-border">
            {value.voices.map((voice) => (
              <li key={voice.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <PreviewButton
                  id={`s-${voice.id}`}
                  preview={preview}
                  onPreview={() => preview.play(`s-${voice.id}`, voice.sample)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{voice.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {voice.source === "design" ? `音色设计：${voice.note}` : "本人录音"}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`删除音色「${voice.name}」`}
                  onClick={() => void removeVoice(voice)}
                  className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
            还没有自定义音色，内置的四个中文声音已经够用
          </p>
        )}
      </div>

      <DesignDialog
        open={designOpen}
        onOpenChange={setDesignOpen}
        preview={preview}
        ensureSaved={ensureSaved}
        onSaved={onVoices}
      />
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onSaved={onVoices} />
      <p className="sr-only">
        当前朗读声音：{voiceLabel(value.narrator.voice, builtin, value.voices)}
      </p>
    </div>
  );
}

const DESIGN_TEXT = "大家好，欢迎收听今天的文章。我们一起慢慢读，有什么想法也欢迎留言告诉我。";

function DesignDialog({
  open,
  onOpenChange,
  preview,
  ensureSaved,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: Preview;
  ensureSaved: () => Promise<boolean>;
  onSaved: (voices: CustomVoice[]) => void;
}) {
  const [description, setDescription] = useState(
    "三十岁左右的女性，声音温和清亮，语速稍慢，像深夜电台的主持人在轻声讲述。",
  );
  const [text, setText] = useState(DESIGN_TEXT);
  const [name, setName] = useState("");
  const [audio, setAudio] = useState<string | null>(null);
  const [busy, setBusy] = useState<"design" | "save" | null>(null);

  async function design() {
    if (!(await ensureSaved())) return;
    setBusy("design");
    try {
      const data = await postJson("/api/admin/tts", { op: "design", description, text });
      setAudio(data.audio);
      preview.play("design", `data:audio/wav;base64,${data.audio}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function save() {
    if (!audio) return;
    setBusy("save");
    try {
      const data = await postJson("/api/admin/tts", {
        op: "saveDesign",
        name: name.trim(),
        description,
        audio,
      });
      onSaved(data.config.voices);
      toast.success("音色已保存", { description: "可以在朗读和播客里选用了" });
      onOpenChange(false);
      setAudio(null);
      setName("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>设计音色</DialogTitle>
          <DialogDescription>
            用一两句话描述想要的声音：性别年龄、音色质感、语气和语速。满意后保存，之后都用这段样音克隆，每段的声音保持一致。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="design-desc">
              声音描述
            </label>
            <Textarea
              id="design-desc"
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="design-text">
              试读的句子
            </label>
            <Input
              id="design-text"
              maxLength={200}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3.5 py-3">
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null || description.trim().length < 4 || text.trim().length < 4}
              onClick={() => void design()}
            >
              {busy === "design" ? <LoaderIcon className="animate-spin" /> : <SparklesIcon />}
              {audio ? "换一个" : "生成样音"}
            </Button>
            {audio ? (
              <PreviewButton
                id="design"
                preview={preview}
                onPreview={() => preview.play("design", `data:audio/wav;base64,${audio}`)}
              />
            ) : null}
            <span className="text-xs text-muted-foreground">
              {busy === "design"
                ? "正在生成，通常几秒钟…"
                : audio
                  ? "听听看，不满意就换一个"
                  : "生成后自动播放"}
            </span>
          </div>
          {audio && (
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="design-name">
                给这个声音起个名字
              </label>
              <Input
                id="design-name"
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：夜读"
                className="mt-1.5"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!audio || !name.trim() || busy !== null} onClick={() => void save()}>
            {busy === "save" && <LoaderIcon className="animate-spin" />}
            保存音色
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (voices: CustomVoice[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("我的声音");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("name", name.trim());
      form.set("consent", consent ? "1" : "0");
      const res = await fetch("/api/admin/tts/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "上传失败");
      onSaved(data.config.voices);
      toast.success("录音已保存为音色");
      onOpenChange(false);
      setFile(null);
      setConsent(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>上传本人录音</DialogTitle>
          <DialogDescription>
            录一段 10~30 秒、安静环境下的朗读（mp3 或 wav，7MB 以内），作为声音克隆的样本。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border px-4 py-4 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft/30"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <UploadIcon className="size-4" />
            </span>
            <span className="min-w-0 text-sm">
              <span className="block truncate text-foreground">
                {file ? file.name : "选择录音文件"}
              </span>
              <span className="block text-xs text-muted-foreground">
                {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "mp3 / wav"}
              </span>
            </span>
          </button>
          <input
            ref={input}
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/wav"
            hidden
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="upload-name">
              音色名字
            </label>
            <Input
              id="upload-name"
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-muted/50 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
            <Checkbox
              className="mt-0.5"
              checked={consent}
              onCheckedChange={(value) => setConsent(Boolean(value))}
            />
            <span>
              这是<strong className="font-medium text-foreground">我本人的声音</strong>
              ，我同意用它合成文章朗读和播客。请勿上传他人的声音。
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={!file || !consent || !name.trim() || busy}
            onClick={() => void upload()}
          >
            {busy && <LoaderIcon className="animate-spin" />}
            上传并保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
