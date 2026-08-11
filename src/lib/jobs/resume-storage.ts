export const JOB_RESUME_BUCKET = "direct-message-attachments";

const RESUME_ROOT = "job-applications";

export function resumeStoragePath(value: string | null | undefined) {
  if (!value) return null;

  let candidate = value.trim();
  try {
    const pathname = new URL(candidate).pathname;
    const markers = [
      `/object/sign/${JOB_RESUME_BUCKET}/`,
      `/object/public/${JOB_RESUME_BUCKET}/`,
      `/object/authenticated/${JOB_RESUME_BUCKET}/`,
    ];
    const marker = markers.find((item) => pathname.includes(item));
    if (!marker) return null;
    candidate = pathname.slice(pathname.indexOf(marker) + marker.length);
  } catch {
    // Current records store the private object path directly.
  }

  try {
    candidate = decodeURIComponent(candidate).replace(/^\/+/, "");
  } catch {
    return null;
  }

  const segments = candidate.split("/");
  if (
    segments.length < 4 ||
    segments[0] !== RESUME_ROOT ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null;
  }

  return segments.join("/");
}

export function resumeBelongsToApplicant(path: string, applicantId: string) {
  const segments = path.split("/");
  return segments[0] === RESUME_ROOT && segments[2] === applicantId;
}

export function resumeOriginalName(value: string | null | undefined) {
  const path = resumeStoragePath(value);
  if (!path) return null;
  const storedName = path.split("/").pop() ?? "CV";
  return storedName.replace(/^\d+-[0-9a-f-]{36}-/i, "") || "CV";
}
