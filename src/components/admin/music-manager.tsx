"use client";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Music2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { audioTime, type MusicConfig, type MusicTrack } from "@/lib/music";
import { useConfirm } from "./confirm";
import { ImageField } from "./image-field";
import { MusicSettings } from "./music-settings";
import { Row } from "./settings-ui";
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
export function MusicManager({ initial, config }: { initial: MusicTrack[]; config: MusicConfig }) {
  const [tracks, setTracks] = useState(initial),
    [draft, setDraft] = useState<Draft>(blank),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null),
    confirm = useConfirm();
  const patch = (value: Partial<Draft>) => setDraft((current) => ({ ...current, ...value }));
  async function operate(payload: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "音乐操作失败");
      setTracks(data.tracks);
      return true;
    } catch (error) {
      setError((error as Error).message);
      toast.error((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (await operate({ op: "save", track: draft })) {
      setOpen(false);
      toast.success("曲目已保存");
    }
  }
  async function move(index: number, direction: number) {
    const ids = tracks.map((track) => track.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    await operate({ op: "reorder", ids });
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/music/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "音频上传失败");
      setDraft({ ...blank, ...data.track, sortOrder: tracks.length });
      setOpen(true);
      toast.success("音频已上传，核对曲目信息后保存");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <MusicSettings initial={config} />
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => picker.current?.click()}>
          <UploadIcon className="size-4" />
          上传音频
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => {
            setDraft({ ...blank, sortOrder: tracks.length });
            setOpen(true);
          }}
        >
          <PlusIcon className="size-4" />
          添加外部音频
        </Button>
        <span className="text-xs text-muted-foreground">
          mp3 / m4a / ogg，最大 30MB；上传后自动读取曲名、作者、专辑与封面。
        </span>
        <input
          ref={picker}
          type="file"
          accept=".mp3,.m4a,.ogg"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          正在处理…
        </p>
      )}
      <div className="space-y-2">
        {tracks.map((track, index) => (
          <div
            key={track.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <Music2Icon className="size-5 shrink-0 text-brand" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{track.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[track.artist, track.album, audioTime(track.duration), track.license]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Switch
              aria-label={`启用${track.title}`}
              checked={track.enabled}
              disabled={busy}
              onCheckedChange={(enabled) =>
                void operate({ op: "save", track: { ...track, enabled } })
              }
            />
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`上移${track.title}`}
                disabled={busy || index === 0}
                onClick={() => void move(index, -1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`下移${track.title}`}
                disabled={busy || index === tracks.length - 1}
                onClick={() => void move(index, 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`编辑${track.title}`}
                disabled={busy}
                onClick={() => {
                  setDraft(track);
                  setOpen(true);
                }}
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`删除${track.title}`}
                disabled={busy}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `删除「${track.title}」？`,
                      description: "曲目会移出播放列表，媒体库中的文件仍保留。",
                    })
                  )
                    await operate({ op: "delete", id: track.id });
                }}
              >
                <Trash2Icon />
              </Button>
            </div>
          </div>
        ))}
        {!tracks.length && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            还没有音乐。上传一首有授权的轻音乐，或添加外部音频地址。
          </div>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft.id ? "编辑曲目" : "添加曲目"}</DialogTitle>
            <DialogDescription>核对曲目信息、作品来源和授权协议后保存。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Row label="曲名">
              <Input
                required
                value={draft.title}
                onChange={(event) => patch({ title: event.target.value })}
              />
            </Row>
            <Row label="作者">
              <Input
                value={draft.artist}
                onChange={(event) => patch({ artist: event.target.value })}
              />
            </Row>
            <Row label="专辑">
              <Input
                value={draft.album}
                onChange={(event) => patch({ album: event.target.value })}
              />
            </Row>
            <Row label="音频地址">
              <Input
                required
                value={draft.audioUrl}
                onChange={(event) => patch({ audioUrl: event.target.value })}
                placeholder="https://example.com/music.mp3"
              />
            </Row>
            <Row label="封面">
              <ImageField value={draft.coverUrl} onChange={(coverUrl) => patch({ coverUrl })} />
            </Row>
            <Row label="时长（秒）">
              <Input
                type="number"
                min={0}
                max={86400}
                step="any"
                value={draft.duration}
                onChange={(event) => patch({ duration: Number(event.target.value) })}
              />
            </Row>
            <Row label="LRC 歌词">
              <Textarea
                value={draft.lyrics}
                onChange={(event) => patch({ lyrics: event.target.value })}
                className="min-h-24 font-mono text-xs"
                placeholder="[00:12.00]一句歌词"
              />
            </Row>
            <Row label="作品来源">
              <Input
                value={draft.sourceUrl}
                onChange={(event) => patch({ sourceUrl: event.target.value })}
                placeholder="原作品页面地址"
              />
            </Row>
            <Row label="授权协议">
              <Input
                value={draft.license}
                onChange={(event) => patch({ license: event.target.value })}
                placeholder="例如 CC BY 4.0"
              />
            </Row>
            <Row label="授权协议地址">
              <Input
                value={draft.licenseUrl}
                onChange={(event) => patch({ licenseUrl: event.target.value })}
              />
            </Row>
            <Row label="启用曲目">
              <Switch checked={draft.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
            </Row>
            <Button type="submit" disabled={busy}>
              {busy ? "保存中…" : "保存曲目"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
