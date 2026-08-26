import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/server/jobStore";
import { getDemucsPrediction } from "@/lib/server/separate";
import { transcribeVocals } from "@/lib/server/whisper";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/packs/jobs/[id] — poll Demucs (+ optional Whisper) */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status === "succeeded" || job.status === "failed") {
    return NextResponse.json(publicJob(job));
  }

  // Another poll already running Whisper
  if (job.status === "transcribing") {
    return NextResponse.json(publicJob(job));
  }

  if (!job.demucsPredictionId) {
    return NextResponse.json(publicJob(job));
  }

  try {
    const pred = await getDemucsPrediction(job.demucsPredictionId);

    if (pred.status === "failed" || pred.status === "canceled") {
      const failed = updateJob(id, {
        status: "failed",
        error: pred.error || "Demucs failed",
      });
      return NextResponse.json(publicJob(failed!));
    }

    if (pred.status !== "succeeded" || !pred.vocalsUrl || !pred.backingUrl) {
      return NextResponse.json(publicJob(job));
    }

    let segments = job.segments;
    if (job.wantTranscribe && segments === undefined) {
      updateJob(id, {
        status: "transcribing",
        vocalsUrl: pred.vocalsUrl,
        backingUrl: pred.backingUrl,
      });
      try {
        segments = await transcribeVocals(pred.vocalsUrl);
      } catch (e) {
        console.warn("transcribe failed", e);
        segments = [];
      }
    }

    const done = updateJob(id, {
      status: "succeeded",
      vocalsUrl: pred.vocalsUrl,
      backingUrl: pred.backingUrl,
      segments: segments ?? [],
    });
    return NextResponse.json(publicJob(done!));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Poll failed";
    const failed = updateJob(id, { status: "failed", error: message });
    return NextResponse.json(publicJob(failed!), { status: 500 });
  }
}

function publicJob(job: NonNullable<ReturnType<typeof getJob>>) {
  return {
    id: job.id,
    status: job.status,
    error: job.error,
    vocalsUrl: job.vocalsUrl,
    backingUrl: job.backingUrl,
    durationMs: job.durationMs,
    segments: job.segments,
    sourceName: job.sourceName,
    updatedAt: job.updatedAt,
  };
}
