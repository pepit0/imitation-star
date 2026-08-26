import { NextRequest, NextResponse } from "next/server";
import {
  createJob,
  pruneOldJobs,
  updateJob,
} from "@/lib/server/jobStore";
import {
  isReplicateConfigured,
  startDemucsPrediction,
} from "@/lib/server/separate";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/packs/jobs — upload audio/video, start Demucs job */
export async function POST(req: NextRequest) {
  pruneOldJobs();

  if (!isReplicateConfigured()) {
    return NextResponse.json(
      {
        error:
          "Stem separation is not configured. Set REPLICATE_API_TOKEN in .env.local.",
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data with an audio/video file." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Missing file field (MP4 / audio)." },
      { status: 400 }
    );
  }

  const maxBytes = 95 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: "File must be 95 MB or smaller." },
      { status: 400 }
    );
  }

  const transcribe = form.get("transcribe") === "true";
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "application/octet-stream";
  const dataUri = `data:${mime};base64,${bytes.toString("base64")}`;

  const job = createJob({
    status: "separating",
    sourceName: file.name,
    wantTranscribe: transcribe,
  });

  try {
    const { predictionId } = await startDemucsPrediction(dataUri);
    updateJob(job.id, {
      demucsPredictionId: predictionId,
      status: "separating",
    });

    return NextResponse.json({
      id: job.id,
      status: "separating",
      configured: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to start Demucs";
    updateJob(job.id, { status: "failed", error: message });
    return NextResponse.json(
      { id: job.id, status: "failed", error: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    configured: isReplicateConfigured(),
    message: "POST a multipart file to create a separation job.",
  });
}
