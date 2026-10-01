export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { announceSetupToken } = await import("@/server/security");
    announceSetupToken();
    const { startJobWorker } = await import("@/server/background-jobs");
    startJobWorker();
  }
}
