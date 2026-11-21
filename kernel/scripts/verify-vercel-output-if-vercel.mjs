const isVercel = process.env["VERCEL"] === "1" || process.env["VERCEL"] === "true";

if (isVercel) {
  await import("./verify-vercel-output.mjs");
} else {
  console.log("VERCEL OUTPUT: SKIPPED (build local/Lovable; VERCEL is not set).");
}
