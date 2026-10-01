import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import http from "node:http";
import { createRequire, Module } from "node:module";

/** Standalone regression. All database/auth/migration files stay in a disposable directory. */
async function main() {
  const scratch = fs.mkdtempSync(
    path.join(process.env.PI_SCRATCH_DIR ?? os.tmpdir(), "reader-ai-check-"),
  );
  process.env.DATA_DIR = path.join(scratch, "data");
  process.env.MIGRATIONS_DIR = path.join(scratch, "drizzle");
  process.env.SITE_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET = "reader-test-secret-only-abcdefghijklmnopqrstuvwxyz";
  process.env.ADMIN_SETUP_TOKEN = "reader-test-setup";
  fs.cpSync(path.resolve("drizzle"), process.env.MIGRATIONS_DIR, { recursive: true });
  const journalPath = path.join(process.env.MIGRATIONS_DIR, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  if (!journal.entries.some((entry: { tag: string }) => entry.tag === "0008_reader_ai")) {
    journal.entries.push({
      idx: journal.entries.length,
      version: "6",
      when: journal.entries.at(-1).when + 100000,
      tag: "0008_reader_ai",
      breakpoints: true,
    });
    fs.writeFileSync(journalPath, JSON.stringify(journal));
  }
  // Standalone Node has no Next page runtime. Auth's page-only redirect is unused here.
  const require = createRequire(path.resolve("package.json"));
  const navigationPath = require.resolve("next/navigation");
  const navigation = new Module(navigationPath);
  navigation.exports = {
    redirect: () => {
      throw new Error("Unexpected page redirect in API regression");
    },
  };
  require.cache[navigationPath] = navigation;
  const { db, schema, getSqlite } = await import("../src/db");
  const { eq } = await import("drizzle-orm");
  const reader = await import("../src/server/reader-ai");
  const queue = await import("../src/server/background-jobs");
  const config = await import("../src/server/reader-ai-config");
  const { saveAiConfig, getAiUsage } = await import("../src/server/ai-config");
  const { extractBenchmark, summaryProse } = await import("../src/lib/reader-ai");
  const routes = await import("../src/app/api/admin/reader-ai/route");
  const jobRoutes = await import("../src/app/api/admin/jobs/route");
  const { outboundFetch } = await import("../src/server/outbound");
  const { getAuth } = await import("../src/lib/auth");
  let mode: "openai" | "anthropic" | "fail" | "timeout" = "openai";
  let mutate: (() => void) | undefined;
  let calls = 0;
  const observed: Record<string, unknown>[] = [];
  const server = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    observed.push(JSON.parse(body));
    calls++;
    const callback = mutate;
    mutate = undefined;
    callback?.();
    if (mode === "fail") {
      response.writeHead(503);
      response.end("private provider secret");
      return;
    }
    if (mode === "timeout") return;
    response.writeHead(200, { "content-type": "text/event-stream" });
    const event = (data: unknown) => response.write(`data: ${JSON.stringify(data)}\n\n`);
    if (mode === "anthropic") {
      event({ type: "message_start", message: { usage: { input_tokens: 11 } } });
      event({
        type: "content_block_delta",
        delta: { type: "thinking_delta", thinking: "隐藏思考" },
      });
      event({
        type: "content_block_delta",
        delta: {
          type: "text_delta",
          text: "<think>隐藏</think>中文摘要 test-secret 记录原文事实。",
        },
      });
      event({
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 7 },
      });
      event({ type: "message_stop" });
    } else {
      event({
        choices: [
          {
            delta: {
              reasoning_content: "隐藏思考",
              content: "<think>隐藏</think>中文摘要 test-secret 记录原文事实。",
            },
          },
        ],
      });
      event({
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      });
      response.write("data: [DONE]\n\n");
    }
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  try {
    getSqlite();
    const insert = (content = "这里是可用于摘要的中文正文。\n\n```terminal\n不要送给模型\n```") =>
      db
        .insert(schema.posts)
        .values({
          title: "测试文章",
          slug: `check-${Math.random()}`,
          type: "post",
          status: "published",
          publishedAt: new Date(Date.now() - 1000),
          content,
        })
        .returning()
        .get();
    const post = insert();
    const hash = reader.readerContentHash(post.content);
    assert.equal(config.getReaderAiConfig().autoSummary, false);
    assert.equal(reader.enqueueAutoSummary(post), null);
    assert.equal(summaryProse("正文\n```terminal\nsecret\n"), "正文");
    assert.equal(
      summaryProse("正文\n\nNodeQuality 报告\nCPU Model: 测试\n内存：4 GiB\n\n末尾正文"),
      "正文\n\n\n末尾正文",
    );
    assert.equal(summaryProse("正文\n    command\n<pre>终端数据</pre>"), "正文");
    assert.equal(
      extractBenchmark("NodeQuality 报告\nCPU Model: AMD EPYC\n内存：4 GiB").items.length,
      2,
    );
    assert.equal(
      extractBenchmark(
        "########################\n硬件质量体检报告 Check.Place\n########################\nCPU Model: AMD EPYC\n内存：4 GiB",
      ).items.length,
      2,
    );
    assert.throws(() =>
      reader.readerAiOperationSchema.parse({ op: "settings", config: { apiKey: "secret" } }),
    );
    saveAiConfig({
      baseUrl,
      apiKey: "test-secret",
      model: "main-test",
      fastModel: "fast-test",
      protocol: "openai",
      timeoutMs: 1000,
    });
    config.saveReaderAiConfig({ autoSummary: true });
    const job = reader.enqueueAutoSummary(post)!;
    assert.equal(reader.enqueueAutoSummary(post)!.id, job.id);
    assert.ok(!JSON.stringify(queue.getJob(job.id)).includes("test-secret"));
    const child = (code: string) => {
      const moduleUrl = pathToFileURL(path.resolve("src/server/background-jobs.ts")).href;
      const output = spawnSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "-e",
          `(async()=>{const q=await import(${JSON.stringify(moduleUrl)});${code}})().catch(e=>{console.error(e);process.exitCode=1})`,
        ],
        { cwd: process.cwd(), env: process.env, encoding: "utf8" },
      );
      assert.equal(output.status, 0, output.stderr);
      return output.stdout.trim();
    };
    assert.equal(child(`console.log(q.getJob(${JSON.stringify(job.id)}).status)`), "pending");
    const claimed = queue.claimJob({ leaseMs: 30000 })!;
    assert.equal(claimed.id, job.id);
    assert.equal(child("console.log(q.claimJob()===null)"), "true");
    const reclaimed = queue.claimJob({ now: Date.now() + 31000, leaseMs: 30000 })!;
    assert.equal(reclaimed.id, job.id);
    assert.notEqual(reclaimed.leaseToken, claimed.leaseToken);
    assert.equal(queue.heartbeatJob(job.id, claimed.leaseToken!), false);
    queue.cancelJob(job.id);
    assert.equal(queue.getJob(job.id)!.status, "cancelled");
    reader.retryReaderJob(job.id);
    assert.equal((await queue.runOne())!.status, "succeeded");
    const saved = reader.getPublishedReaderInsights(post.id).summary!;
    assert.ok(saved.text.includes("中文摘要"));
    assert.ok(!/隐藏思考|<think>|test-secret/.test(saved.text));
    assert.ok(saved.text.includes("[密钥已隐藏]"));
    assert.equal(observed[0].model, "main-test");
    assert.ok(!JSON.stringify(observed[0]).includes("不要送给模型"));
    assert.equal(reader.enqueueAutoSummary(post), null);
    const beforeRead = calls;
    reader.getPublishedReaderInsights(post.id);
    reader.getPublishedReaderInsights(post.id);
    assert.equal(calls, beforeRead);
    mode = "anthropic";
    saveAiConfig({ protocol: "anthropic" });
    reader.enqueueSummary(post.id, hash, true);
    assert.equal((await queue.runOne())!.status, "succeeded");
    const usage = getAiUsage().days[0];
    assert.equal(usage.inputTokens, 22);
    assert.equal(usage.outputTokens, 14);
    assert.equal(usage.unknownUsage, 0);

    reader.enqueueSummary(post.id, hash, true);
    mutate = () => reader.saveReaderSummary(post.id, hash, "管理员刚刚手写的摘要");
    assert.equal((await queue.runOne())!.status, "cancelled");
    assert.equal(reader.getPublishedReaderInsights(post.id).summary!.text, "管理员刚刚手写的摘要");
    reader.enqueueSummary(post.id, hash, true);
    mutate = () =>
      db
        .update(schema.posts)
        .set({ content: "新的正文，旧任务不能覆盖。" })
        .where(eq(schema.posts.id, post.id))
        .run();
    assert.equal((await queue.runOne())!.status, "cancelled");
    assert.equal(reader.getPublishedReaderInsights(post.id).summary, null);
    assert.throws(() => reader.saveReaderSummary(post.id, hash, "过时"));
    const updated = db.select().from(schema.posts).where(eq(schema.posts.id, post.id)).get()!;
    const newHash = reader.readerContentHash(updated.content);
    reader.saveReaderSummary(post.id, newHash, "保留已有摘要");
    mode = "fail";
    const failed = reader.enqueueSummary(post.id, newHash, true);
    assert.equal((await queue.runOne({ retryDelayMs: 0 }))!.status, "retry");
    assert.equal((await queue.runOne({ retryDelayMs: 0 }))!.status, "retry");
    assert.equal((await queue.runOne({ retryDelayMs: 0 }))!.status, "failed");
    assert.equal(queue.getJob(failed.id)!.attempts, 3);
    assert.ok(!queue.getJob(failed.id)!.error!.includes("private provider"));
    assert.equal(reader.getPublishedReaderInsights(post.id).summary!.text, "保留已有摘要");
    reader.retryReaderJob(failed.id);
    mode = "timeout";
    assert.equal((await queue.runOne())!.status, "retry");
    assert.match(queue.getJob(failed.id)!.error!, /超时/);
    queue.cancelJob(failed.id);
    mode = "openai";
    saveAiConfig({ protocol: "openai" });
    const cancelled = reader.enqueueSummary(post.id, newHash, true);
    mutate = () => queue.cancelJob(cancelled.id);
    assert.equal((await queue.runOne())!.status, "cancelled");
    assert.equal(reader.getPublishedReaderInsights(post.id).summary!.text, "保留已有摘要");
    const exhausted = reader.enqueueSummary(post.id, newHash, true);
    for (let i = 0; i < 3; i++)
      assert.equal(queue.claimJob({ now: Date.now() + i * 200, leaseMs: 50 })!.id, exhausted.id);
    assert.equal(queue.claimJob({ now: Date.now() + 1000 }), null);
    assert.equal(queue.getJob(exhausted.id)!.status, "failed");
    const delayed = reader.enqueueSummary(post.id, newHash, true);
    db.update((await import("../src/db/reader-schema")).backgroundJobs)
      .set({ availableAt: Date.now() + 60000 })
      .where(eq((await import("../src/db/reader-schema")).backgroundJobs.id, delayed.id))
      .run();
    assert.equal(queue.claimJob(), null);
    queue.cancelJob(delayed.id);
    const heartbeat = reader.enqueueSummary(post.id, newHash, true);
    const pulseClaim = queue.claimJob({ leaseMs: 50 })!;
    assert.equal(queue.heartbeatJob(heartbeat.id, pulseClaim.leaseToken!, 30000), true);
    assert.equal(queue.claimJob({ now: Date.now() + 100 }), null);
    queue.cancelJob(heartbeat.id);

    // Retrying A against B must release A's original dedupe key.
    const rebound = insert("正文 A，旧版本摘要。");
    const hashA = reader.readerContentHash(rebound.content);
    const taskA = reader.enqueueSummary(rebound.id, hashA);
    queue.cancelJob(taskA.id);
    db.update(schema.posts)
      .set({ content: "正文 B，新版本摘要。" })
      .where(eq(schema.posts.id, rebound.id))
      .run();
    const taskB = reader.retryReaderJob(taskA.id);
    assert.notEqual(taskB.contentHash, hashA);
    assert.notEqual(taskB.dedupeKey, taskA.dedupeKey);
    queue.cancelJob(taskB.id);
    db.update(schema.posts)
      .set({ content: rebound.content })
      .where(eq(schema.posts.id, rebound.id))
      .run();
    const restoredTask = reader.enqueueSummary(rebound.id, hashA);
    assert.notEqual(restoredTask.id, taskA.id);
    assert.equal(restoredTask.contentHash, hashA);
    queue.cancelJob(restoredTask.id);

    // Authorized article save/history/enqueue is one transaction.
    const { savePost } = await import("../src/server/post-service");
    config.saveReaderAiConfig({ autoSummary: true });
    const durable = await savePost({
      type: "post",
      title: "事务验收",
      slug: "transaction-check",
      content: "这里是事务保存的中文正文。",
      status: "published",
    });
    const durableJob = queue.listJobs(durable.id)[0];
    assert.equal(durableJob.authorization, "auto");
    queue.cancelJob(durableJob.id);
    await savePost({ ...durable, title: "只改标题", tags: [] });
    assert.equal(queue.listJobs(durable.id).length, 1);
    const countHistory = () =>
      getSqlite()
        .prepare("SELECT count(*) AS n FROM post_versions WHERE post_id=?")
        .get(durable.id) as { n: number };
    const historyBefore = countHistory().n;
    getSqlite().exec(
      "CREATE TRIGGER fail_reader_enqueue BEFORE INSERT ON background_jobs BEGIN SELECT RAISE(ABORT, 'test enqueue failure'); END;",
    );
    try {
      await assert.rejects(
        savePost({ ...durable, content: "更新正文应与入队一起回滚。", tags: [] }),
        /test enqueue failure/,
      );
      assert.equal(
        db.select().from(schema.posts).where(eq(schema.posts.id, durable.id)).get()!.content,
        durable.content,
      );
      assert.equal(countHistory().n, historyBefore);
      assert.equal(queue.listJobs(durable.id).length, 1);
    } finally {
      getSqlite().exec("DROP TRIGGER fail_reader_enqueue");
    }
    const changedPost = await savePost({
      ...durable,
      content: "更新正文成功后自动入队。",
      tags: [],
    });
    assert.equal(queue.listJobs(durable.id).length, 2);
    const queuedChange = queue
      .listJobs(durable.id)
      .find((j) => j.contentHash === reader.readerContentHash(changedPost.content))!;
    queue.cancelJob(queuedChange.id);
    config.saveReaderAiConfig({ autoSummary: false });

    const report =
      "正文。\n\n```terminal\nNodeQuality / Check.Place\n硬件质量体检报告\nCPU Model: AMD EPYC 7543\n内存：4 GiB\nGeekbench 6 单核：1234 多核：4567\nIP质量体检报告\n风险评分：低风险 0\nNetflix: Yes (US)\n网络质量体检报告\n电信 上海：180 ms CN2 GIA\n联通 北京：160 ms 9929\n移动 广州：140 ms CMI\n```\n\nCPU Model: 不应提取正文假指标";
    const bench = insert(report);
    const extracted = reader.extractReaderBenchmark(bench.id);
    assert.equal(extracted.matched, true);
    assert.ok(extracted.items.some((item) => item.group === "ip"));
    assert.ok(extracted.items.some((item) => item.group === "media"));
    assert.equal(extracted.items.filter((item) => item.group === "network").length, 3);
    assert.ok(!extracted.items.some((item) => item.value.includes("假指标")));
    assert.equal(extracted.items[0].evidence[0].line, 6);
    const escaped = extractBenchmark(
      "```ansi\nNodeQuality Check.Place\n\x1b\\[36mCPU：\x1b\\[0mAMD EPYC\n&#x20;\x1b\\[36m内存：\x1b\\[0m4 GiB\n流媒体检测\n服务商： Netflix Disney+ YouTube\n\n状态： 仅自制 屏蔽 解锁\n\n地区： [JP] [JP] [JP]\n```\n![三网图片](https://example.com/network.png)",
    );
    assert.equal(escaped.items[0].value, "AMD EPYC");
    assert.equal(escaped.items[1].value, "4 GiB");
    assert.equal(escaped.items[1].evidence[0].line, 4);
    const mediaTable = escaped.items.find((item) => item.group === "media")!;
    assert.match(mediaTable.value, /状态： 仅自制 屏蔽 解锁/);
    assert.equal(mediaTable.evidence.length, 3);
    assert.ok(escaped.items.every((item) => !/\x1b|&#x20;/.test(item.value)));
    assert.ok(!escaped.items.some((item) => item.group === "network"));
    assert.equal(reader.getPublishedReaderInsights(bench.id).benchmark, null);
    assert.throws(() =>
      reader.saveReaderBenchmark(bench.id, extracted.contentHash, "伪造", ["hardware:999"]),
    );
    reader.saveReaderBenchmark(
      bench.id,
      extracted.contentHash,
      "管理员确认的结论",
      extracted.items.slice(0, 2).map((item) => item.key),
    );
    assert.equal(reader.getPublishedReaderInsights(bench.id).benchmark!.items.length, 2);
    assert.equal(extractBenchmark("CPU Model: 无报告标志").matched, false);
    db.update(schema.posts)
      .set({ publishedAt: new Date(Date.now() + 60000) })
      .where(eq(schema.posts.id, bench.id))
      .run();
    assert.equal(reader.getPublishedReaderInsights(bench.id).benchmark, null);
    db.update(schema.posts).set({ status: "draft" }).where(eq(schema.posts.id, bench.id)).run();
    assert.equal(reader.getPublishedReaderInsights(bench.id).benchmark, null);
    config.saveReaderAiConfig({ showSummary: false });
    assert.equal(reader.getPublishedReaderInsights(post.id).summary, null);
    config.saveReaderAiConfig({ showSummary: true });
    const page = db
      .insert(schema.posts)
      .values({ title: "页面", slug: "page-check", type: "page", content: "页面正文" })
      .returning()
      .get();
    assert.throws(() => reader.enqueueSummary(page.id, reader.readerContentHash(page.content)));
    assert.throws(() =>
      reader.enqueueSummary(
        insert("```terminal\noutput\n```").id,
        reader.readerContentHash("```terminal\noutput\n```"),
      ),
    );
    await assert.rejects(outboundFetch(baseUrl, { accept: "text/plain", maxBytes: 100 }));

    assert.equal(
      (await routes.GET(new Request("http://localhost:3000/api/admin/reader-ai"))).status,
      401,
    );
    assert.equal(
      (await jobRoutes.GET(new Request("http://localhost:3000/api/admin/jobs"))).status,
      401,
    );
    const signup = await getAuth().api.signUpEmail({
      body: {
        email: "reader-check@example.invalid",
        name: "测试管理员",
        password: "reader-test-password",
      },
      headers: new Headers({
        origin: "http://localhost:3000",
        "x-setup-token": "reader-test-setup",
      }),
      asResponse: true,
    });
    assert.equal(signup.status, 200, await signup.clone().text());
    const cookie = signup.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ");
    assert.ok(cookie);
    const request = (url: string, body?: unknown, origin = "http://localhost:3000") =>
      new Request(`http://localhost:3000${url}`, {
        method: body ? "POST" : "GET",
        headers: { cookie, origin, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    assert.equal((await routes.GET(request(`/api/admin/reader-ai?postId=${post.id}`))).status, 200);
    assert.equal(
      (
        await routes.POST(
          request(
            "/api/admin/reader-ai",
            { op: "settings", config: { enabled: false } },
            "http://evil.invalid",
          ),
        )
      ).status,
      403,
    );
    assert.equal(config.getReaderAiConfig().enabled, true);
    assert.equal(
      (
        await routes.POST(
          request("/api/admin/reader-ai", { op: "settings", config: { apiKey: "bad" } }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await jobRoutes.POST(
          request("/api/admin/jobs", { op: "retry", jobId: exhausted.id }, "http://evil.invalid"),
        )
      ).status,
      403,
    );
    assert.equal(
      (await jobRoutes.POST(request("/api/admin/jobs", { op: "retry", jobId: exhausted.id })))
        .status,
      200,
    );
    assert.equal(
      (await jobRoutes.POST(request("/api/admin/jobs", { op: "cancel", jobId: exhausted.id })))
        .status,
      200,
    );
    assert.equal((await jobRoutes.GET(request("/api/admin/jobs"))).status, 200);
    const response = await routes.POST(
      request("/api/admin/reader-ai", { op: "generate", postId: post.id, contentHash: newHash }),
    );
    assert.equal(response.status, 202);
    const view = await response.json();
    assert.equal(view.job.leaseToken, undefined);
    assert.equal((await queue.runOne())!.status, "succeeded");
    const workerJob = reader.enqueueSummary(post.id, newHash, true);
    queue.startJobWorker(100);
    for (let i = 0; i < 30 && queue.getJob(workerJob.id)?.status !== "succeeded"; i++)
      await new Promise((resolve) => setTimeout(resolve, 50));
    await queue.stopJobWorker();
    assert.equal(queue.getJob(workerJob.id)!.status, "succeeded");
    console.log(
      "reader-ai: passed persistence, atomic claim/fencing, heartbeat, exhausted leases, cancel, retries/delay/timeout, content/revision fences, dual protocols/usage/filters, public reads, benchmark source confirmation, signed admin session and same-origin APIs",
    );
  } finally {
    await queue.stopJobWorker();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    getSqlite().close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
