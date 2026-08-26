import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 250 * 1024 * 1024;

/**
 * Client-side upload token endpoint for large OGV temps (Vercel Blob).
 * Needed because Supabase Free Storage caps objects at 50 MB.
 */
export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Large OGV convert needs Vercel Blob (BLOB_READ_WRITE_TOKEN). Add a Blob store in the Vercel project.",
      },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "video/ogg",
          "application/ogg",
          "video/ogv",
          "application/octet-stream",
        ],
        maximumSizeInBytes: MAX_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ purpose: "ogv-convert" }),
      }),
      onUploadCompleted: async () => {
        /* convert route deletes after encode */
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Blob upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
