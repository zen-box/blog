import "server-only";

import nodemailer from "nodemailer";

import { getSettings, siteUrl } from "@/lib/settings";

export function mailConfigured(): boolean {
  const { smtp } = getSettings();
  return Boolean(smtp.host && smtp.user && smtp.pass);
}

export async function sendMail(to: string, subject: string, html: string) {
  const { smtp, siteTitle } = getSettings();
  if (!mailConfigured()) return false;
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  await transport.sendMail({
    from: smtp.from || `"${siteTitle}" <${smtp.user}>`,
    to,
    subject,
    html,
  });
  return true;
}

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** 邮件模板：与站点同色系的简洁卡片 */
export function mailTemplate(opts: {
  title: string;
  intro: string;
  quote?: string;
  body: string;
  link: string;
  linkText: string;
}) {
  const s = getSettings();
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f7f4ee;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#33302b">
  <div style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #e4ddd1;border-radius:16px;padding:28px 28px 24px">
    <p style="margin:0 0 4px;font-size:13px;color:#9a948a">${escape(s.siteTitle)}</p>
    <h1 style="margin:0 0 16px;font-size:20px;color:#1f1d1a">${escape(opts.title)}</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.7">${opts.intro}</p>
    ${opts.quote ? `<div style="margin:0 0 12px;padding:10px 14px;border-left:3px solid #d8d0c2;color:#6e685e;font-size:13px;line-height:1.7">${opts.quote}</div>` : ""}
    <div style="margin:0 0 20px;padding:14px 16px;background:#f2eee6;border-radius:10px;font-size:14px;line-height:1.8">${opts.body}</div>
    <a href="${opts.link}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#2f5c8f;color:#fff;text-decoration:none;font-size:13px">${escape(opts.linkText)}</a>
    <p style="margin:24px 0 0;font-size:12px;color:#9a948a">此邮件由 <a href="${siteUrl()}" style="color:#9a948a">${escape(s.siteTitle)}</a> 自动发送，请勿直接回复。</p>
  </div></body></html>`;
}

export { escape as escapeHtml };
