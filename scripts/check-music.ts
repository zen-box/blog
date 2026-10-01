import assert from "node:assert/strict";
import {
  audioTime,
  lyricAt,
  nextTrackIndex,
  parseLrc,
  readPlayback,
  safeMediaUrl,
} from "../src/lib/music";
const lyrics = parseLrc(
  "[ar:作者]\n[offset:-500]\n[00:01.25][00:02.50]同一句\n[00:03]下一句\n[00:70.00]无效时间\n[00:04.005]尾句",
);
assert.deepEqual(
  lyrics.map((line) => [line.time, line.text]),
  [
    [0.75, "同一句"],
    [2, "同一句"],
    [2.5, "下一句"],
    [3.505, "尾句"],
  ],
);
assert.equal(lyricAt(lyrics, 0), -1);
assert.equal(lyricAt(lyrics, 2), 1);
assert.equal(lyricAt(lyrics, 99), 3);
assert.deepEqual(parseLrc("没有时间戳的文字"), []);
for (let length = 1; length < 8; length++)
  for (let current = 0; current < length; current++) {
    assert.equal(nextTrackIndex(length, current, "single"), current);
    assert.equal(nextTrackIndex(length, current, "list", 1), (current + 1) % length);
    assert.equal(nextTrackIndex(length, current, "list", -1), (current - 1 + length) % length);
    for (const random of [0, 0.25, 0.5, 0.999, 1]) {
      const result = nextTrackIndex(length, current, "shuffle", 1, random);
      assert.ok(result >= 0 && result < length);
      if (length > 1) assert.notEqual(result, current);
    }
  }
assert.equal(nextTrackIndex(0, 0, "list"), -1);
const saved = { trackId: 2, position: 12.5, volume: 0.2, mode: "shuffle" };
assert.deepEqual(readPlayback(JSON.stringify(saved)), saved);
for (const value of [
  null,
  "broken",
  "{}",
  JSON.stringify({ ...saved, trackId: -1 }),
  JSON.stringify({ ...saved, position: -1 }),
  JSON.stringify({ ...saved, volume: 2 }),
  JSON.stringify({ ...saved, mode: "unknown" }),
])
  assert.equal(readPlayback(value), null);
for (const url of [
  "https://example.com/song.mp3",
  "http://localhost:3150/test.ogg",
  "/uploads/2026/10/music.m4a",
])
  assert.ok(safeMediaUrl(url));
for (const url of [
  "javascript:alert(1)",
  "file:///secret",
  "data:audio/mp3;base64,x",
  "https://user:password@example.com/music",
  "/uploads/../secret",
  "//example.com/music.mp3",
  "",
])
  assert.ok(!safeMediaUrl(url));
assert.equal(audioTime(65.9), "1:05");
assert.equal(audioTime(Number.NaN), "0:00");
console.log(
  "音乐回归通过：LRC 多时间戳／偏移／边界，三种播放模式，随机不重复当前曲目，保存状态校验及安全地址。",
);
