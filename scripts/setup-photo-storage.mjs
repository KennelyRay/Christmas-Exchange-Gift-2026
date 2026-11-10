// One-time setup for wishlist photo storage. Run it once per Neon branch, with
// that branch's storage variables in the environment.
//
//   npm run photos:setup -- --for=dev          localhost:3000 and Vercel previews
//   npm run photos:setup -- --for=production   the live site only
//   npm run photos:setup -- --origins=https://a.example,https://b.example
//
// It sets the bucket's CORS rules, then checks the bucket end to end: a test
// upload, an anonymous read (proves public_read), and a browser-style preflight
// from each allowed site. The test file is deleted afterwards.
import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

const BUCKET = "wishlist-photos";
const PRODUCTION = "https://christmas-exchange-gift.vercel.app";
const PREVIEWS = "https://christmas-exchange-gift-*.vercel.app";
const SAMPLE_PREVIEW = "https://christmas-exchange-gift-git-main-krb-projects.vercel.app";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const target = arg("for") ?? "dev";
const origins = arg("origins")?.split(",").map((o) => o.trim()).filter(Boolean)
  ?? (target === "production" ? [PRODUCTION] : ["http://localhost:3000", PREVIEWS]);

const endpoint = process.env.AWS_ENDPOINT_URL_S3?.replace(/\/+$/, "");
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
if (!endpoint || !accessKeyId || !secretAccessKey) {
  console.error("Missing AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY.");
  console.error("Pull them for this branch first: neon env pull --file .env.local");
  process.exit(1);
}

const region = new URL(endpoint).hostname.match(/\.([a-z]{2}-[a-z]+-\d+)\.aws\.neon\.tech$/)?.[1] ?? process.env.AWS_REGION;
const client = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

// Printed first so it's obvious which branch is about to change.
console.log(`Storage: ${new URL(endpoint).hostname} (${region})`);
console.log(`Setting up "${BUCKET}" for: ${origins.join(", ")}\n`);

try {
  await client.send(new HeadBucketCommand({ Bucket: BUCKET }));
} catch {
  console.error(`The bucket "${BUCKET}" doesn't exist on this branch yet. Create it with public read access:`);
  console.error(`  neon buckets create ${BUCKET} --access-level public_read`);
  console.error("or in the Neon Console: your branch > Object storage > New bucket > Public read.");
  process.exit(1);
}

await client.send(
  new PutBucketCorsCommand({
    Bucket: BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origins,
          AllowedMethods: ["PUT", "GET", "HEAD"],
          AllowedHeaders: ["content-type", "cache-control"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);
const saved = await client.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
console.log("CORS rules saved:", JSON.stringify(saved.CORSRules?.[0]?.AllowedOrigins));

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures++;
};

const key = `setup-check/${randomUUID()}.txt`;
const publicUrl = `${endpoint}/${BUCKET}/${key}`;
await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: "setup check", ContentType: "text/plain" }));
try {
  const read = await fetch(publicUrl);
  check(read.ok, `anyone can view photos without signing in (HTTP ${read.status}${read.ok ? "" : ": set the bucket to public read"})`);

  for (const origin of origins) {
    const tried = origin.includes("*") ? SAMPLE_PREVIEW : origin;
    const preflight = await fetch(publicUrl, {
      method: "OPTIONS",
      headers: { Origin: tried, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type,cache-control" },
    });
    const allowed = preflight.headers.get("access-control-allow-origin");
    check(allowed === tried || allowed === "*", `browser uploads allowed from ${tried}`);
  }
} finally {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

console.log(failures === 0 ? "\nPhoto storage is ready on this branch." : `\n${failures} check(s) failed. See above.`);
process.exit(failures === 0 ? 0 : 1);
