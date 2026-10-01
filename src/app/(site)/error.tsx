"use client";

import { PageError } from "@/components/site/page-error";

export default function SiteError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <PageError retry={retry} />;
}
