"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  Disc3Icon,
  GripVerticalIcon,
  LinkIcon,
  LoaderIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { audioTime, type MusicConfig, type MusicTrack } from "@/lib/music";
import { cn } from "@/lib/utils";

import { useConfirm } from "./confirm";
import { ImageField } from "./image-field";

type Draft = Omit<MusicTrack, "id"> & { id?: number };

const blank: Draft = {
  title: "",
  artist: "",
  album: "",
  audioUrl: "",
  coverUrl: "",
  lyrics: "",
  sourceUrl: "",
  license: "",
  licenseUrl: "",
  duration: 0,
  enabled: true,
  sortOrder: 0,
};

/** 常用的授权协议：点一下同时填好名称和链接 */
const LICENSES = [
  { name: "CC0", url: "https://creativecommons.org/publicdomain/zero/1.0/deed.zh-hans" },
  { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/deed.zh-hans" },
  { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hans" },
  { name: "CC BY-NC 4.0", url: "https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hans" },
];

const ACCEPT = ".mp3,.m4a,.ogg,audio/mpeg,audio/mp4,audio/ogg";
const isAudioFile = (f: File) => /\.(mp3|m4a|ogg)$/i.test(f.name) || /^audio\//.test(f.type);

async function musicApi(payload: unknown) {
  const res = await fetch("/api/admin/music", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "音乐操作失败");
  return data as { tracks: MusicTrack[]; config: MusicConfig };
}

async function uploadAudio(file: File): Promise<Draft> {
  const form = new FormData();
  form.set("file", file);
  const res = await fetch("/api/admin/music/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${file.name} 上传失败`);
  return { ...blank, ...data.track };
}

/* ------------------------------------------------------------------ */
/* 播放器设置：改动后自动保存                                                */
/* ------------------------------------------------------------------ */

function PlayerSettings({ initial }: { initial: MusicConfig }) {
  const [config, setConfig] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function persist(next: MusicConfig) {
    setState("saving");
    try {
      const data = await musicApi({ op: "settings", config: next });
      setConfig(data.config);
      setState("saved");
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1600);
    } catch (e) {
      setState("idle");
      toast.error((e as Error).message);
    }
  }

  /** 开关立即保存；音量拖动结束后再保存 */
  function change(next: MusicConfig, delay = 0) {
    setConfig(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(next), delay);
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-5 py-4 md:flex-row md:items-center md:gap-8">
      <label className="flex cursor-pointer items-center gap-3">
        <Switch
          checked={config.enabled}
          onCheckedChange={(enabled) => change({ ...config, enabled })}
          aria-label="在前台显示播放器"
        />
        <span>
          <span className="block text-sm text-foreground">在前台显示播放器</span>
          <span className="block text-xs text-muted-foreground">左下角的音乐入口</span>
        </span>
      </label>
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3",
          !config.enabled && "cursor-not-allowed opacity-50",
        )}
      >
        <Switch
          checked={config.showOnMobile}
          disabled={!config.enabled}
          onCheckedChange={(showOnMobile) => change({ ...config, showOnMobile })}
          aria-label="手机上也显示"
        />
        <span className="text-sm text-foreground">手机上也显示</span>
      </label>
      <div className="flex min-w-0 flex-1 items-center gap-3 md:max-w-xs">
        <span className="shrink-0 text-sm text-foreground">默认音量</span>
        <Slider
          thumbLabel="默认音量"
          min={0}
          max={100}
          value={Math.round(config.defaultVolume * 100)}
          onValueChange={(v) => setConfig((c) => ({ ...c, defaultVolume: (v as number) / 100 }))}
          onValueCommitted={(v) => change({ ...config, defaultVolume: (v as number) / 100 }, 300)}
        />
        <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {Math.round(config.defaultVolume * 100)}%
        </span>
      </div>
      <span
        aria-live="polite"
        className={cn(
          "items-center gap-1.5 text-xs text-muted-foreground md:ml-auto",
          state === "idle" ? "hidden md:flex" : "flex",
        )}
      >
        {state === "saving" && <LoaderIcon className="size-3 animate-spin" />}
        {state === "saving" ? "保存中" : state === "saved" ? "已保存" : ""}
      </span>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 曲目编辑                                                                */
/* ------------------------------------------------------------------ */

function TrackDialog({
  open,
  draft,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  draft: Draft;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: Draft) => Promise<boolean>;
}) {
  const [value, setValue] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(!!draft.lyrics);
  const patch = (p: Partial<Draft>) => setValue((v) => ({ ...v, ...p }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ok = await onSave(value);
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl" data-lenis-prevent>
        <DialogHeader>
          <DialogTitle>{value.id ? "编辑曲目" : "添加曲目"}</DialogTitle>
          <DialogDescription>
            核对曲名、作者和授权协议。播放器会在播放时署名并链接到作品来源。
          </DialogDescription>
        </DialogHeader>
        <form id="track-form" onSubmit={submit} className="grid gap-6 sm:grid-cols-[11rem_1fr]">
          <div className="space-y-3">
            <ImageField
              value={value.coverUrl}
              onChange={(coverUrl) => patch({ coverUrl })}
              placeholder="封面地址"
            />
            {value.audioUrl && (
              <audio
                src={value.audioUrl}
                controls
                preload="metadata"
                className="h-9 w-full"
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (!value.duration && Number.isFinite(d)) patch({ duration: Math.round(d) });
                }}
              />
            )}
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="track-title" className="text-sm text-foreground">
                曲名
              </label>
              <Input
                id="track-title"
                required
                value={value.title}
                onChange={(e) => patch({ title: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="track-artist" className="text-sm text-foreground">
                  作者
                </label>
                <Input
                  id="track-artist"
                  value={value.artist}
                  onChange={(e) => patch({ artist: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label htmlFor="track-album" className="text-sm text-foreground">
                  专辑
                </label>
                <Input
                  id="track-album"
                  value={value.album}
                  onChange={(e) => patch({ album: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <label htmlFor="track-url" className="text-sm text-foreground">
                音频地址
              </label>
              <Input
                id="track-url"
                required
                value={value.audioUrl}
                onChange={(e) => patch({ audioUrl: e.target.value, duration: 0 })}
                placeholder="https://example.com/music.mp3"
                className="mt-1.5 font-mono text-[13px]"
              />
              {value.duration > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  时长 {audioTime(value.duration)}
                </p>
              )}
            </div>

            <fieldset className="space-y-3 rounded-xl bg-muted/40 p-4">
              <legend className="sr-only">来源与授权</legend>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-sm text-foreground">授权协议</span>
                {LICENSES.map((l) => (
                  <button
                    key={l.name}
                    type="button"
                    onClick={() => patch({ license: l.name, licenseUrl: l.url })}
                    aria-pressed={value.license === l.name}
                    className={cn(
                      "h-6 rounded-full border px-2.5 text-xs transition-colors",
                      value.license === l.name
                        ? "border-brand/40 bg-brand/10 text-brand"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  aria-label="授权协议名称"
                  value={value.license}
                  onChange={(e) => patch({ license: e.target.value })}
                  placeholder="协议名称，例如 CC BY 4.0"
                />
                <Input
                  aria-label="授权协议链接"
                  value={value.licenseUrl}
                  onChange={(e) => patch({ licenseUrl: e.target.value })}
                  placeholder="协议链接（可选）"
                  className="font-mono text-[13px]"
                />
              </div>
              <Input
                aria-label="作品来源"
                value={value.sourceUrl}
                onChange={(e) => patch({ sourceUrl: e.target.value })}
                placeholder="作品来源页面（可选）"
                className="font-mono text-[13px]"
              />
            </fieldset>

            <div>
              <button
                type="button"
                onClick={() => setLyricsOpen((v) => !v)}
                aria-expanded={lyricsOpen}
                className="text-sm text-brand hover:opacity-80"
              >
                {lyricsOpen ? "收起歌词" : value.lyrics ? "编辑歌词" : "添加歌词（LRC）"}
              </button>
              {lyricsOpen && (
                <Textarea
                  aria-label="LRC 歌词"
                  value={value.lyrics}
                  onChange={(e) => patch({ lyrics: e.target.value })}
                  className="mt-2 min-h-32 font-mono text-xs"
                  placeholder={"[00:12.00]第一句歌词\n[00:17.50]第二句歌词"}
                />
              )}
            </div>
          </div>
        </form>
        <DialogFooter className="items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
            <Switch
              checked={value.enabled}
              onCheckedChange={(enabled) => patch({ enabled })}
              aria-label="加入播放列表"
            />
            加入播放列表
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" form="track-form" disabled={saving}>
              {saving && <LoaderIcon className="size-3.5 animate-spin" />}
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* 曲目列表                                                                */
/* ------------------------------------------------------------------ */

function Cover({
  track,
  playing,
  onToggle,
}: {
  track: MusicTrack;
  playing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={playing ? `暂停试听${track.title}` : `试听${track.title}`}
      className="group/cover relative size-11 shrink-0 overflow-hidden rounded-lg bg-muted"
    >
      {track.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.coverUrl} alt="" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center bg-linear-to-br from-brand/15 to-ochre/20 text-brand">
          <Disc3Icon className="size-5" />
        </span>
      )}
      <span
        className={cn(
          "absolute inset-0 grid place-items-center bg-black/35 text-white transition-opacity",
          playing
            ? "opacity-100"
            : "opacity-0 group-hover/cover:opacity-100 group-focus-visible/cover:opacity-100",
        )}
      >
        {playing ? (
          <PauseIcon className="size-4" />
        ) : (
          <PlayIcon className="size-4 translate-x-px" />
        )}
      </span>
    </button>
  );
}

export function MusicManager({ initial, config }: { initial: MusicTrack[]; config: MusicConfig }) {
  const [tracks, setTracks] = useState(initial);
  const [draft, setDraft] = useState<Draft>(blank);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [uploading, setUploading] = useState<string[]>([]);
  const [fileOver, setFileOver] = useState(false);
  const [armed, setArmed] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const dragDepth = useRef(0);
  const confirm = useConfirm();

  function openDialog(next: Draft) {
    setDraft(next);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  }

  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);

  async function operate(payload: unknown, success?: string) {
    try {
      const data = await musicApi(payload);
      setTracks(data.tracks);
      if (success) toast.success(success);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }

  async function upload(files: File[]) {
    const audioFiles = files.filter(isAudioFile);
    if (!audioFiles.length) {
      toast.error("只支持 mp3、m4a、ogg 格式的音频");
      return;
    }
    setUploading(audioFiles.map((f) => f.name));
    try {
      if (audioFiles.length === 1) {
        // 单个文件：先核对信息再保存
        const track = await uploadAudio(audioFiles[0]);
        openDialog({ ...track, sortOrder: tracks.length });
        return;
      }
      let added = 0;
      for (const [i, file] of audioFiles.entries()) {
        try {
          const track = await uploadAudio(file);
          if (await operate({ op: "save", track: { ...track, sortOrder: tracks.length + i } }))
            added++;
        } catch (e) {
          toast.error((e as Error).message);
        }
        setUploading((list) => list.filter((n) => n !== file.name));
      }
      if (added) toast.success(`已添加 ${added} 首`, { description: "记得补充作者和授权协议" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading([]);
    }
  }

  async function reorder(ids: number[]) {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    setTracks(ids.map((id) => byId.get(id)!).filter(Boolean));
    await operate({ op: "reorder", ids });
  }

  function move(index: number, delta: number) {
    const ids = tracks.map((t) => t.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    void reorder(ids);
  }

  function togglePreview(track: MusicTrack) {
    const el = audio.current;
    if (!el) return;
    if (previewId === track.id) {
      el.pause();
      setPreviewId(null);
      return;
    }
    el.src = track.audioUrl;
    el.volume = 0.6;
    void el.play().then(
      () => setPreviewId(track.id),
      () => toast.error("这段音频暂时无法播放"),
    );
  }

  function finishDrag() {
    if (dragId != null && dropAt != null) {
      const ids = tracks.map((t) => t.id).filter((id) => id !== dragId);
      const from = tracks.findIndex((t) => t.id === dragId);
      ids.splice(dropAt > from ? dropAt - 1 : dropAt, 0, dragId);
      if (ids.join() !== tracks.map((t) => t.id).join()) void reorder(ids);
    }
    setDragId(null);
    setDropAt(null);
    setArmed(null);
  }

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div className="space-y-5">
      <PlayerSettings initial={config} />

      <section
        className="relative rounded-2xl border border-border bg-card"
        onDragEnter={(e) => {
          if (!hasFiles(e)) return;
          dragDepth.current++;
          setFileOver(true);
        }}
        onDragLeave={(e) => {
          if (!hasFiles(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setFileOver(false);
        }}
        onDragOver={(e) => {
          if (hasFiles(e)) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setFileOver(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5">
          <div className="flex items-baseline gap-3">
            <h3 className="text-sm font-medium text-foreground">播放列表</h3>
            {tracks.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {tracks.length} 首 · 共 {audioTime(totalDuration)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                openDialog({ ...blank, sortOrder: tracks.length });
              }}
            >
              <LinkIcon />
              外部音频
            </Button>
            <Button
              size="sm"
              onClick={() => picker.current?.click()}
              disabled={uploading.length > 0}
            >
              {uploading.length ? <LoaderIcon className="animate-spin" /> : <UploadIcon />}
              上传音频
            </Button>
          </div>
        </header>

        <AnimatePresence initial={false}>
          {uploading.map((name) => (
            <motion.div
              key={name}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3 text-sm text-muted-foreground">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted">
                  <LoaderIcon className="size-4 animate-spin" />
                </span>
                <span className="min-w-0 truncate">正在上传 {name}，读取曲目信息…</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {tracks.length > 0 ? (
          <ol>
            {tracks.map((track, index) => (
              <li
                key={track.id}
                draggable={armed === track.id}
                onDragStart={(e) => {
                  setDragId(track.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(track.id));
                }}
                onDragOver={(e) => {
                  if (dragId == null) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDropAt(e.clientY > rect.top + rect.height / 2 ? index + 1 : index);
                }}
                onDrop={(e) => {
                  if (dragId == null) return;
                  e.preventDefault();
                  finishDrag();
                }}
                onDragEnd={finishDrag}
                className={cn(
                  "group relative flex items-center gap-3 border-b border-border/60 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/40 sm:px-4",
                  dragId === track.id && "opacity-40",
                )}
              >
                {dropAt === index && dragId != null && (
                  <span
                    aria-hidden
                    className="absolute inset-x-4 -top-px h-0.5 rounded-full bg-brand"
                  />
                )}
                {dropAt === tracks.length && index === tracks.length - 1 && dragId != null && (
                  <span
                    aria-hidden
                    className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-brand"
                  />
                )}
                <span
                  onPointerDown={() => setArmed(track.id)}
                  onPointerUp={() => setArmed(null)}
                  aria-hidden
                  className="hidden cursor-grab touch-none text-subtle opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing sm:block"
                >
                  <GripVerticalIcon className="size-4" />
                </span>
                <Cover
                  track={track}
                  playing={previewId === track.id}
                  onToggle={() => togglePreview(track)}
                />
                <div className={cn("min-w-0 flex-1", !track.enabled && "opacity-50")}>
                  <p className="truncate text-sm text-foreground">{track.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[track.artist, track.album].filter(Boolean).join(" · ") || "未填写作者"}
                  </p>
                </div>
                <span className="hidden md:block">
                  {track.license ? (
                    track.licenseUrl ? (
                      <a
                        href={track.licenseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        {track.license}
                      </a>
                    ) : (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        {track.license}
                      </span>
                    )
                  ) : (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                      未填写授权
                    </span>
                  )}
                </span>
                <span className="hidden w-12 text-right font-mono text-xs text-muted-foreground tabular-nums sm:block">
                  {track.duration ? audioTime(track.duration) : "—"}
                </span>
                <Switch
                  size="sm"
                  checked={track.enabled}
                  aria-label={`在播放列表中显示${track.title}`}
                  onCheckedChange={(enabled) =>
                    void operate({ op: "save", track: { ...track, enabled } })
                  }
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`${track.title}的更多操作`}
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      />
                    }
                  >
                    <MoreHorizontalIcon className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem
                      onClick={() => {
                        openDialog(track);
                      }}
                    >
                      <PencilIcon />
                      编辑信息
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUpIcon />
                      上移
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={index === tracks.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDownIcon />
                      下移
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `删除「${track.title}」？`,
                            description: "曲目会移出播放列表，已上传的音频文件仍保留在媒体存储中。",
                          })
                        )
                          await operate({ op: "delete", id: track.id }, "已删除");
                      }}
                    >
                      <Trash2Icon />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ol>
        ) : (
          !uploading.length && (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-muted text-brand">
                <Disc3Icon className="size-7" />
              </span>
              <p className="mt-4 font-medium text-foreground">还没有音乐</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                上传几首有授权的轻音乐，或者添加外部音频地址。也可以直接把音频文件拖到这里。
              </p>
              <div className="mt-5 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    openDialog({ ...blank, sortOrder: 0 });
                  }}
                >
                  <PlusIcon />
                  外部音频
                </Button>
                <Button onClick={() => picker.current?.click()}>
                  <UploadIcon />
                  上传音频
                </Button>
              </div>
            </div>
          )
        )}

        <AnimatePresence>
          {fileOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl border-2 border-dashed border-brand/60 bg-card/90 backdrop-blur-sm"
            >
              <span className="flex flex-col items-center gap-2 text-sm text-brand">
                <UploadIcon className="size-6" />
                松开上传 mp3 / m4a / ogg
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <p className="px-1 text-xs text-muted-foreground">
        单个文件最大
        30MB，上传后自动读取曲名、作者、专辑和封面。拖动手柄或在「…」菜单里调整顺序；关闭开关的曲目不会出现在前台。
      </p>

      <input
        ref={picker}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void upload(files);
        }}
      />
      <audio
        ref={audio}
        hidden
        onEnded={() => setPreviewId(null)}
        onPause={() => setPreviewId(null)}
      />

      <TrackDialog
        key={dialogKey}
        open={dialogOpen}
        draft={draft}
        onOpenChange={setDialogOpen}
        onSave={(value) =>
          operate({ op: "save", track: value }, value.id ? "已保存" : "已加入播放列表")
        }
      />
    </div>
  );
}
