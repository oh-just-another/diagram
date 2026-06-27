import type { ReactNode } from "react";
import Content from "@theme-original/DocItem/Content";
import type ContentType from "@theme/DocItem/Content";
import type { WrapperProps } from "@docusaurus/types";
import GeneratedNotice from "@site/src/components/GeneratedNotice";

type Props = WrapperProps<typeof ContentType>;

// Swizzle (--wrap): prepend the "generated draft" banner to every docs page's
// body. Delete this file (and the GeneratedNotice component) once the docs are
// human-reviewed.
export default function ContentWrapper(props: Props): ReactNode {
  return (
    <>
      <GeneratedNotice />
      <Content {...props} />
    </>
  );
}
