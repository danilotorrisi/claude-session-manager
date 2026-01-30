import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import type { R2Config } from "../types";

export function getR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function uploadReport(
  r2Config: R2Config,
  sessionName: string,
  htmlContent: string,
  timestamp: string
): Promise<string> {
  const client = getR2Client(r2Config);
  const key = `reports/${sessionName}/${timestamp}.html`;

  await client.send(
    new PutObjectCommand({
      Bucket: r2Config.bucketName,
      Key: key,
      Body: htmlContent,
      ContentType: "text/html",
    })
  );

  if (r2Config.publicUrl) {
    const base = r2Config.publicUrl.replace(/\/$/, "");
    return `${base}/${key}`;
  }

  return `https://${r2Config.bucketName}.${r2Config.accountId}.r2.cloudflarestorage.com/${key}`;
}

export async function testR2Credentials(
  r2Config: R2Config
): Promise<{ success: boolean; message: string }> {
  try {
    const client = getR2Client(r2Config);
    await client.send(
      new HeadBucketCommand({ Bucket: r2Config.bucketName })
    );
    return { success: true, message: "Connection successful" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, message: `Connection failed: ${message}` };
  }
}
