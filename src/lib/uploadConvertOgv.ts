import * as tus from "tus-js-client";
import { DUB_PACKS_BUCKET } from "@/lib/cloudPacks";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Measured ceiling for non-resumable POSTs to this project's Storage.
 * Bucket limit is 250 MB, but standard uploads 413 above ~50 MB.
 */
export const STANDARD_STORAGE_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export type StorageUploadOptions = {
  contentType?: string;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
  /** When set, use signed upload for small files. */
  signedToken?: string;
};

function authHeaders(bearer: string, anonKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${bearer}`,
    apikey: anonKey,
    "x-upsert": "false",
  };
}

async function resolveBearerAndAnon(): Promise<{
  bearer: string;
  anonKey: string;
}> {
  const supabase = createClient();
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";
  if (!anonKey) {
    throw new Error("Missing Supabase publishable/anon key for storage upload.");
  }
  const { data } = await supabase.auth.getSession();
  const bearer = data.session?.access_token || anonKey;
  return { bearer, anonKey };
}

async function standardUpload(
  storagePath: string,
  file: Blob,
  opts: StorageUploadOptions
): Promise<void> {
  const supabase = createClient();
  const contentType = opts.contentType || file.type || "video/ogg";

  if (opts.signedToken) {
    const { error } = await supabase.storage
      .from(DUB_PACKS_BUCKET)
      .uploadToSignedUrl(storagePath, opts.signedToken, file, {
        contentType,
        upsert: false,
      });
    if (error) throw new Error(error.message);
    opts.onProgress?.(100);
    return;
  }

  const { error } = await supabase.storage
    .from(DUB_PACKS_BUCKET)
    .upload(storagePath, file, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  opts.onProgress?.(100);
}

function tusUpload(
  storagePath: string,
  file: Blob,
  opts: StorageUploadOptions,
  bearer: string,
  anonKey: string
): Promise<void> {
  const endpoint = `${getSupabaseUrl().replace(/\/$/, "")}/storage/v1/upload/resumable`;
  const contentType = opts.contentType || file.type || "video/ogg";

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: authHeaders(bearer, anonKey),
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: DUB_PACKS_BUCKET,
        objectName: storagePath,
        contentType,
        cacheControl: "3600",
      },
      onError: (err) => reject(err),
      onProgress: (uploaded, total) => {
        if (total > 0) {
          opts.onProgress?.(Math.round((uploaded / total) * 100));
        }
      },
      onSuccess: () => resolve(),
    });

    const onAbort = () => {
      void upload.abort(true).finally(() => {
        reject(new DOMException("Transcode aborted", "AbortError"));
      });
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    upload
      .findPreviousUploads()
      .then((previous) => {
        if (opts.signal?.aborted) {
          onAbort();
          return;
        }
        if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]!);
        upload.start();
      })
      .catch(reject);
  });
}

/**
 * Upload a temp OGV into dub-packs for server-side convert.
 * Uses TUS resumable uploads above the ~50 MB standard POST ceiling.
 */
export async function uploadConvertOgv(
  storagePath: string,
  file: Blob,
  opts: StorageUploadOptions = {}
): Promise<void> {
  if (file.size <= STANDARD_STORAGE_UPLOAD_MAX_BYTES) {
    await standardUpload(storagePath, file, opts);
    return;
  }

  const { bearer, anonKey } = await resolveBearerAndAnon();
  await tusUpload(storagePath, file, opts, bearer, anonKey);
}
