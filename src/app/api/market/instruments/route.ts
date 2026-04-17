import { NextResponse } from "next/server";
import { ALL_INSTRUMENTS } from "@/lib/constants";

export async function GET() {
  return NextResponse.json({ instruments: ALL_INSTRUMENTS });
}
