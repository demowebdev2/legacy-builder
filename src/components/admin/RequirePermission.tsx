"use client";

import type { ReactNode } from "react";
import { PageHeader } from "@/components/layouts/PortalShell";
import { ButtonLink } from "@/components/ui/Button";
import { Alert, PageLoading } from "@/components/ui/Feedback";
import type { Permission } from "@/domain/permissions";
import { useStaff } from "./hooks";

/**
 * Renders the page only for roles holding `permission`, so a pasted URL shows a clear message instead of
 * a failed query. Convex still enforces the permission on every function — this is presentation only.
 */
export function RequirePermission({ permission, title, children }: { permission: Permission; title: string; children: ReactNode }) {
  const { can, loading } = useStaff();
  if (loading) {
    return (
      <>
        <PageHeader title={title} />
        <PageLoading />
      </>
    );
  }
  if (!can(permission)) {
    return (
      <>
        <PageHeader title={title} />
        <div className="card card-bd" style={{ maxWidth: 560 }}>
          <Alert kind="e">
            <b>Your role cannot open this page.</b> Ask an administrator if you need access.
          </Alert>
          <div className="b-row" style={{ marginTop: "1rem" }}>
            <ButtonLink href="/admin" variant="out" size="s" icon="back">
              Back to the dashboard
            </ButtonLink>
          </div>
        </div>
      </>
    );
  }
  return <>{children}</>;
}
