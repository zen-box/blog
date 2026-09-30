/** 部分浏览器和阅读器会直接请求 /favicon.ico，统一跳转到当前的网站图标 */
export function GET() {
  return new Response(null, {
    status: 307,
    headers: { Location: "/site-icon", "Cache-Control": "public, max-age=86400" },
  });
}
