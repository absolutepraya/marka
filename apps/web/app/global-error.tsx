"use client";

export default function GlobalError() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#f5f7fa",
          color: "#172235",
        }}
      >
        <main
          style={{
            minHeight: "100svh",
            display: "grid",
            placeContent: "center",
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 24 }}>Marka couldn&apos;t start</h1>
          <p>Please check your connection and try again.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: "12px 24px", font: "inherit", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
