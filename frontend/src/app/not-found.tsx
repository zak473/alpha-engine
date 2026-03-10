import Link from "next/link";

export default function NotFound() {
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
      <p
        style={{
          fontSize: 48,
          fontWeight: 800,
          color: "var(--text0)",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        404
      </p>
      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text0)" }}>
        Page not found
      </p>
      <p style={{ fontSize: 12, color: "var(--text2)", maxWidth: 300 }}>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link href="/dashboard" className="btn btn-md btn-primary" style={{ marginTop: 4 }}>
        Back to dashboard
      </Link>
    </div>
  );
}
