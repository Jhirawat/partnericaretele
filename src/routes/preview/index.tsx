import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/preview/")({staticData:{sitemap:false},
  beforeLoad: () => {
    throw redirect({ to: "/preview/admin" });
  },
});
