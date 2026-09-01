import { appendFileSync } from "node:fs";
import { NextResponse } from "next/server";

const LOG = "/private/tmp/claude-501/-Users-contratacr/a4175880-a9ef-4fa9-8f6a-c39dfb1891e4/scratchpad/probe-log.txt";

export async function POST(request: Request) {
  appendFileSync(LOG, `${await request.text()}\n`);
  return NextResponse.json({ ok: true });
}
