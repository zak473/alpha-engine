"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text0)" }}>
        Something went wrong
      </p>
      <p style={{ fontSize: 12, color: "var(--text2)", maxWidth: 320 }}>
        An unexpected error occurred. Try refreshing the page or go back to the dashboard.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          className="btn btn-md btn-primary"
          onClick={reset}
        >
          Try again
        </button>
        <Link href="/dashboard" className="btn btn-md btn-ghost">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
