"use client";

import { RefreshCw } from "lucide-react";
import type { FormEvent } from "react";

export function OfflineRetryButton() {
  function retry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.reload();
  }

  return (
    <form method="get" onSubmit={retry}>
      <button className="button button-primary" type="submit">
        <RefreshCw size={16} aria-hidden="true" />
        Retry
      </button>
    </form>
  );
}
