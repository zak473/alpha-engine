import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.SGO_API_KEY ?? "";

  try {
    const res = await fetch(
      `https://api.sportsgameodds.com/v2/events/?apiKey=${apiKey}&status=inProgress`,
      { cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json({ events: [] });
    const data = await res.json();
    return NextResponse.json({ events: data.data ?? [] });
  } catch {
    return NextResponse.json({ events: [] });
  }
}
