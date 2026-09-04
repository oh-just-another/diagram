import { Redirect } from "@docusaurus/router";
import useBaseUrl from "@docusaurus/useBaseUrl";
import type { ReactNode } from "react";

/**
 * `/docs/` has no index route (the sidebar is auto-generated from the
 * section folders), so a hand-typed or externally linked `/docs/` URL used
 * to 404. Send it to the first page of the introduction instead.
 */
export default function DocsIndexRedirect(): ReactNode {
  return <Redirect to={useBaseUrl("/docs/introduction/installation")} />;
}
