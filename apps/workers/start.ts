import "dotenv/config";

const profile = process.env.WORKER_PROFILE ?? "screenshot-first";

switch (profile) {
  case "screenshot-first":
    console.info("Starting workers with profile: screenshot-first");
    await import("./screenshotFirst");
    break;
  case "full":
    console.info("Starting workers with profile: full");
    await import("./index");
    break;
  default:
    throw new Error("WORKER_PROFILE must be screenshot-first or full");
}
