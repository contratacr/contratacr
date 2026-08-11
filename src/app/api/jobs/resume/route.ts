import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { JOB_RESUME_BUCKET, resumeOriginalName, resumeStoragePath } from "@/lib/jobs/resume-storage";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const PDF_MIME = "application/pdf";
const DOC_MIME = "application/msword";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function safeFileName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return cleaned || "cv";
}

function sniffResumeMime(buffer: Buffer, fileName: string) {
  const extension = fileName.toLocaleLowerCase("en-US").split(".").pop();
  if (extension === "pdf" && buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return PDF_MIME;
  if (
    extension === "doc" &&
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
  ) return DOC_MIME;
  if (
    extension === "docx" &&
    buffer.length >= 4 &&
    buffer[0] === 0x50 && buffer[1] === 0x4b &&
    ((buffer[2] === 0x03 && buffer[3] === 0x04) || (buffer[2] === 0x05 && buffer[3] === 0x06) || (buffer[2] === 0x07 && buffer[3] === 0x08))
  ) return DOCX_MIME;
  return null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ resume: null }, { status: 401 });

  const db = createAdminClient();
  const { data: application, error } = await db
    .from("job_applications")
    .select("resume_url,created_at")
    .eq("applicant_id", user.id)
    .not("resume_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const path = resumeStoragePath(application?.resume_url);
  if (!path) return NextResponse.json({ resume: null });

  return NextResponse.json({
    resume: {
      url: path,
      name: resumeOriginalName(path),
      usedAt: application?.created_at ?? null,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const rl = enforceRateLimit(req, "job-resume-upload", 12, 60_000);
  if (rl) return rl;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para adjuntar tu CV." }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  const jobId = String(formData?.get("jobId") ?? "");
  if (!jobId) return NextResponse.json({ error: "Empleo requerido." }, { status: 400 });
  if (!file) return NextResponse.json({ error: "Adjunta tu CV." }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El CV debe pesar 8 MB o menos." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffResumeMime(buffer, file.name);
  if (!mime) {
    return NextResponse.json({ error: "Formato no permitido. Adjunta tu CV en PDF, DOC o DOCX." }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: job, error: jobError } = await db.from("job_posts").select("id,status").eq("id", jobId).maybeSingle();
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  if (!job || job.status !== "published") return NextResponse.json({ error: "Este empleo no recibe postulaciones." }, { status: 404 });

  const name = safeFileName(file.name);
  const path = `job-applications/${jobId}/${user.id}/${Date.now()}-${crypto.randomUUID()}-${name}`;
  const { error: uploadError } = await db.storage.from(JOB_RESUME_BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  return NextResponse.json({ url: path, name, path }, { headers: { "Cache-Control": "private, no-store" } });
}
