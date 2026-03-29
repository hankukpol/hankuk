"use client";

import {
  getDisplayErrorDetails,
  getDisplayErrorMessage,
} from "@/lib/error-display";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const details = getDisplayErrorDetails(error);

  return (
    <html>
      <body>
        <div style={{ padding: 32, fontFamily: "monospace" }}>
          <h1 style={{ color: "red" }}>Global Error</h1>
          <p>Digest: {error.digest}</p>
          <p>{getDisplayErrorMessage(error)}</p>
          {details ? (
            <pre style={{ background: "#fff0f0", padding: 16, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {details}
            </pre>
          ) : null}
        </div>
      </body>
    </html>
  );
}
