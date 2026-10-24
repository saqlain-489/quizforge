# How HTTP Caching Works

## Why caches exist

Every time a browser loads a page, it may ask servers for dozens of files: HTML, stylesheets, scripts, images and fonts. Most of these files do not change between visits. HTTP caching lets a client keep a copy of a response and reuse it later, so the next request is answered from the copy instead of the network. A cache hit saves bandwidth, makes pages load faster, and takes load off the origin server.

## Where responses are cached

There are two kinds of cache. A private cache belongs to one user; the browser's own cache is the usual example. A shared cache sits between many users and the origin server, such as a CDN or a proxy run by a company. Because a shared cache serves the same stored response to many people, a response that contains personal data must never be stored there. The `Cache-Control: private` directive tells shared caches not to store a response while still allowing the browser to keep it.

## Freshness

A stored response is fresh for a limited time, called its freshness lifetime. The server sets this with `Cache-Control: max-age=N`, where N is a number of seconds. A response sent with `max-age=3600` can be reused for one hour without asking the server again. Shared caches also understand `s-maxage`, which overrides `max-age` for them only. When a response carries no freshness information at all, caches may estimate a lifetime from the `Last-Modified` header, a practice called heuristic caching. Once the lifetime runs out, the response becomes stale.

## Validation and conditional requests

A stale response is not necessarily useless. Instead of downloading the file again, the cache can ask the server whether its copy is still valid. This is called revalidation, and it uses conditional requests. If the stored response included an `ETag`, an opaque identifier for one version of the resource, the cache sends it back in an `If-None-Match` header. If the response included `Last-Modified`, the cache can send that date in `If-Modified-Since`. When nothing has changed, the server replies with `304 Not Modified` and no body, and the cache marks its copy fresh again. Only when the resource has changed does the server send a full `200 OK` response with the new content.

## no-cache is not no-store

Two directives are often confused. `no-cache` does not forbid storing a response; it means the cache must revalidate with the server before every reuse. `no-store` is the strict one: it tells every cache not to keep the response at all. Sensitive responses, such as a bank statement, should use `no-store`, while pages that must always be current but are expensive to send in full can use `no-cache` together with an `ETag`, so most checks end in a small 304.

## Serving stale content on purpose

Sometimes a slightly old response is better than a slow one. The `stale-while-revalidate` directive lets a cache serve a stale response immediately while it revalidates in the background, so the next visitor gets the updated copy. For example, `max-age=60, stale-while-revalidate=300` keeps a response fresh for one minute and allows it to be served stale for up to five more minutes while a refresh happens.

## Versioned URLs and immutable files

Long freshness lifetimes raise a problem: how do users get a new version of a file that their cache considers fresh for a year? The common answer is cache busting. Build tools put a hash of the file's content into its name, such as `app.3f9a2c.js`. When the file changes, its name changes, so the HTML points to a URL the cache has never seen. Files named this way can safely be sent with `max-age=31536000, immutable`; the `immutable` directive tells the browser not to revalidate the file even when the user reloads the page.

## Responses that vary

A server can return different content for the same URL, for example compressed or uncompressed, or in different languages. The `Vary` header lists the request headers that influenced the response. With `Vary: Accept-Encoding`, a cache stores separate copies for clients that accept gzip and those that do not. Listing too many headers in `Vary` fragments the cache and lowers the hit rate, so it should name only the headers that actually change the response.
