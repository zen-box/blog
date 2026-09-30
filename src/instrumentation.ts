/** 服务器启动时执行一次（Next.js 在构建阶段不会调用） */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // 全新部署：把创建管理员需要的设置令牌打印到日志里
  const { announceSetupToken } = await import("@/server/security");
  announceSetupToken();
}
