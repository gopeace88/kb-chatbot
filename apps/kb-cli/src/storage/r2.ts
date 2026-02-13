import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

export function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    throw new Error(
      "R2 환경변수가 설정되지 않았습니다 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL)",
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

let cachedClient: S3Client | null = null;
let cachedEndpoint: string | null = null;

function getClient(config: R2Config): S3Client {
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  if (cachedClient && cachedEndpoint === endpoint) return cachedClient;

  cachedClient = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  cachedEndpoint = endpoint;
  return cachedClient;
}

export async function uploadImageToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
  config: R2Config,
): Promise<string> {
  const client = getClient(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  return `${config.publicUrl}/${key}`;
}
