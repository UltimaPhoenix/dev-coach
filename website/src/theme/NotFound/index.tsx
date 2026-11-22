// The site's 404 page, ejected from @docusaurus/theme-classic (`docusaurus swizzle
// @docusaurus/theme-classic NotFound --eject`; the theme marks NotFound safe to eject). The docs are
// served at the site root, so a missing address is matched by the docs plugin, whose DocRoot renders
// only ./Content inside its own layout: this wrapper runs only for a route outside the docs. The
// page's title and text therefore live in ./Content, for both cases.
import Layout from "@theme/Layout";
import NotFoundContent from "@theme/NotFound/Content";
import type { ReactNode } from "react";

export default function Index(): ReactNode {
  return (
    <Layout>
      <NotFoundContent />
    </Layout>
  );
}
