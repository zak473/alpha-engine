import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.BALLDONTLIE_API_KEY ?? "";
  const keySet = key.length > 0;

  let apiStatus: number | null = null;
  let apiSample: unknown = null;

  if (keySet) {
    try {
      const res = await fetch("https://api.balldontlie.io/cs/v1/matches?per_page=3", {
        headers: { Authorization: key },
        cache: "no-store",
      });
      apiStatus = res.status;
      if (res.ok) {
        const json = await res.json();
        apiSample = json.data?.slice(0, 2) ?? [];
      } else {
        apiSample = await res.text();
      }
    } catch (e) {
      apiSample = String(e);
    }
  }

  return NextResponse.json({
    keySet,
    keyPrefix: keySet ? key.slice(0, 8) + "..." : null,
    apiStatus,
    apiSample,
  });
}
