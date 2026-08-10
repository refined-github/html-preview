import Shell from "./shell.html" with { type: "text" };

const ShellPattern = new URLPattern({
  pathname: "/:user/:repo/(?:raw|blob)/:path(.+)",
});
const RenderPattern = new URLPattern({
  pathname: "/_render/:user/:repo/raw/:path(.+)",
});

export default {
  async fetch(request, env) {
    const { url } = request;
    const { pathname } = new URL(url);

    if (pathname === "/") {
      return Response.redirect(
        "https://github.com/refined-github/html-preview",
      );
    }

    if (ShellPattern.test(url)) {
      return new Response(Shell.replace("{{target}}", `/_render${pathname}`), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          // Disallow crawling
          "x-robots-tag": "none",
        },
      });
    }

    const renderMatch = RenderPattern.exec(url);
    if (!renderMatch) {
      return new Response("Not Found", { status: 404 });
    }

    const isHtml = pathname.endsWith(".html") || pathname.endsWith(".htm");
    if (isHtml && !request.headers.get("referer")?.startsWith(env.HOST)) {
      return new Response("Forbidden", { status: 403 });
    }

    const { user, repo, path } = renderMatch.pathname.groups;
    const response = await fetch(
      `https://raw.githubusercontent.com/${user}/${repo}/${path}`,
      request,
    );
    const headers = new Headers(response.headers);

    // Correct content type
    if (isHtml) {
      headers.set("content-type", "text/html; charset=utf-8");
    } else if (pathname.endsWith(".css")) {
      headers.set("content-type", "text/css; charset=utf-8");
    } else if (pathname.endsWith(".js")) {
      headers.set("content-type", "text/javascript; charset=utf-8");
    }

    // Allow embedding
    headers.set("x-frame-options", "sameorigin");
    // Restrict CSP: scripts run freely (sandboxed, opaque origin), but lock framing
    headers.set(
      "content-security-policy",
      "script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src *; connect-src *; frame-ancestors 'self'",
    );
    // Strip any cookies GitHub might set
    headers.delete("set-cookie");
    // Prevent MIME sniffing
    headers.set("x-content-type-options", "nosniff");
    // Disallow crawling
    headers.set("x-robots-tag", "none");

    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  },
} satisfies ExportedHandler<Env>;
