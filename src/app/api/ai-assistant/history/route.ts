import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ conversations: [] });
}

export async function POST() {
  return NextResponse.json({ ok: true, persisted: false });
}

export async function DELETE() {
  return NextResponse.json({ ok: true });
}
