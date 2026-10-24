# HTTP Caching: Check Your Understanding

From "How HTTP Caching Works" (669 words, 8 passages). Generated 2026-10-24 by quizforge.

## Questions

**1.** Why must a response that contains personal data never be stored in a shared cache such as a CDN?

   A. A shared cache serves the same stored response to many people
   B. A shared cache deletes stored responses after one hour
   C. A shared cache can only store compressed responses
   D. A shared cache never revalidates its stored copies

**2.** What does the s-maxage directive do?

   A. It doubles max-age for every cache on the path
   B. It sets the lifetime in minutes instead of seconds
   C. It overrides max-age, but only for shared caches
   D. It overrides max-age, but only for the browser

**3.** True or false: A response sent with no-cache may be stored, but the cache must revalidate it with the server before reusing it.

**4.** A cache revalidates a stale response and the resource has not changed. What does the server send back?

   A. 304 Not Modified with no body
   B. 200 OK with the full content
   C. 404 Not Found with no body
   D. 412 Precondition Failed

**5.** To revalidate a response that came with an ETag, the cache sends that ETag back in the ____ request header.

**6.** A response is sent with max-age=60, stale-while-revalidate=300. A request for it arrives three minutes later. What does the cache do?

   A. Discards the copy and downloads the full response again first
   B. Serves the stale copy at once and refreshes it in the background
   C. Serves the copy as fresh without contacting the server at all
   D. Holds the request until the server confirms the copy is valid

**7.** True or false: A file named with a hash of its content can be cached for a year, because any change to the file produces a new URL.

**8.** Why should a server list only the headers that really change a response in its Vary header?

## Answer key

1. **A**: A shared cache serves the same stored response to many people. Whatever a shared cache stores can be handed to the next person who requests the same URL, so one user's data could reach someone else.
> "Because a shared cache serves the same stored response to many people, a response that contains personal data must never be stored there." (p02)
2. **C**: It overrides max-age, but only for shared caches. s-maxage is read by shared caches such as CDNs and proxies; a private cache like the browser keeps using max-age.
> "Shared caches also understand s-maxage, which overrides max-age for them only." (p03)
3. **True**. no-cache does not forbid storing; it requires a check with the server before every reuse. no-store is the directive that forbids keeping the response.
> "no-cache does not forbid storing a response; it means the cache must revalidate with the server before every reuse." (p05)
4. **A**: 304 Not Modified with no body. A 304 tells the cache that its stored copy is still valid, so nothing is downloaded again; a full 200 OK is sent only when the resource changed.
> "When nothing has changed, the server replies with 304 Not Modified and no body, and the cache marks its copy fresh again." (p04)
5. **If-None-Match**. If-None-Match carries the ETag; If-Modified-Since is the date-based equivalent used with Last-Modified.
> "If the stored response included an ETag, an opaque identifier for one version of the resource, the cache sends it back in an If-None-Match header." (p04)
6. **B**: Serves the stale copy at once and refreshes it in the background. After one minute the response is stale, but stale-while-revalidate lets the cache serve it for up to five more minutes while it refreshes the copy in the background.
> "For example, max-age=60, stale-while-revalidate=300 keeps a response fresh for one minute and allows it to be served stale for up to five more minutes while a refresh happens." (p06)
7. **True**. When the content changes, the hash in the name changes too, so pages point to a URL no cache has stored yet.
> "When the file changes, its name changes, so the HTML points to a URL the cache has never seen." (p07)
8. Each header named in Vary makes the cache keep a separate copy for every value of that header. Naming headers that do not change the response splits the cache into near-identical copies, so fewer requests find a match and the hit rate drops.
   Rubric: Vary makes the cache store separate copies per value of the listed headers; Unneeded headers split the cache into more copies than necessary; More copies means fewer requests are served from the cache
> "Listing too many headers in Vary fragments the cache and lowers the hit rate, so it should name only the headers that actually change the response." (p08)

## Run report

- Planned 8, delivered 8.
- 5 items passed every check on the first try; 2 were fixed by a retry with the checker's feedback; 1 was rewritten after review.
- Judge: 8 graded, 1 escalation to the strong model, 0 not run.
- Model calls: planner 2, writer 11, judge_screen 9, judge_full 1. Replay run: scripted model replies, no cost.
