# DRAFT — Clarification request to SkillsMP

**Status: DRAFT. NOT SENT.** Prepared 2026-08-27 at the user's instruction (decision #4).
**Do not send without reviewing the sender identity and contact details below.**

Resolves: `RSK-002` · Converts `DEC-004` from ASSUMPTION to DECIDED.

**Suggested channels** (SkillsMP's terms direct questions to their social channels; their
`/about` and `openapi.json` list GitHub and X, and `openapi.json` names "SkillsMP Support"):
GitHub issue or discussion on their repository, or X/Twitter DM. A GitHub issue is preferable —
it creates a public, timestamped record, which is worth more than a private reply if the
interpretation is ever questioned.

**Before sending, fill in:** `[YOUR NAME]`, `[CONTACT EMAIL]`, and confirm the AppMD
description is how you want the project characterised publicly. This is the first thing
SkillsMP will know about AppMD, and it will read as a statement of intent.

---

**Subject:** Clarification on permitted API use and automated access for an indexing application

Hello,

I'm building **AppMD** (`skill.appmd.dev`), an open skill-intelligence layer that helps AI
agents find and understand agent skills. I want to use SkillsMP correctly, so I'd rather ask
first than assume — particularly because your Terms and your `robots.txt` leave one question I
can't answer from the documents alone.

I've read your Terms of Service, `robots.txt`, `/about`, the API documentation, `llms.txt` and
the OpenAPI spec. I want to be explicit about what I am **not** asking for: I am not asking to
scrape the site, and I am not looking for a way around the clause that reads *"You may not
scrape or systematically download large portions of the website."* I've designed around that
clause rather than against it — AppMD retrieves skill **content** from the original GitHub
repositories, not from SkillsMP.

What I would like to confirm:

1. **API-key holders and `robots.txt`.** Your `robots.txt` sets `Disallow: /api/` for all user
   agents, while your documentation invites programmatic access to `/api/v1/skills/search` with
   a bearer token. My reading is that the `Disallow` is aimed at autonomous crawlers, and that a
   client using a key you issued is an invited API consumer rather than a crawler. **Is that
   reading correct?**

2. **Ongoing automated use.** Is automated access through `/api/v1/` permitted for an
   application that queries on an ongoing basis for discovery and indexing, within your
   published rate limits (500 requests/day, 30/minute for key holders)?

3. **Storing returned metadata.** Are there restrictions on storing the metadata your API
   returns — skill name, author, description, GitHub URL, star count, category, occupation,
   detected language? AppMD would store these as **source facts attributed to SkillsMP**, with
   a link back to the SkillsMP page alongside the link to the origin repository.

4. **The MCP server.** Your `llms.txt` documents `POST /mcp` with `search_skills`, `get_skill`
   and `list_categories`, no daily quota, and IP-based limits of 50 ingress requests per 10
   seconds and 30 tool calls per 60 seconds. Is that endpoint intended for sustained application
   use, or primarily for interactive agent sessions? I'd rather use it as intended than infer
   from the absence of a quota.

5. **Any sanctioned bulk or incremental channel I've missed.** I found your sitemaps
   (`skills-popular`, `skills-discovered`, `repositories-discovered`) and the RSS feed at
   `/feed.xml`. The sitemaps appear to expose a deliberate sample rather than the full
   catalogue. Is there a bulk or delta channel you'd prefer applications like mine to use?

6. **Guidance for applications that link back.** AppMD's design points users to the original
   GitHub repository, and would credit SkillsMP as the discovery source with a link to the
   corresponding SkillsMP page. If you have a preferred attribution format, or guidance for
   downstream applications generally, I'll follow it.

For context on how AppMD behaves: it identifies itself with a truthful, contactable
User-Agent; it honours `Crawl-delay`, `Retry-After` and every published rate limit; it does not
attempt to circumvent rate limiting or bot detection; it does not bulk-fetch `/creators/**`
pages; and it preserves attribution and each skill's own repository licence throughout.

If any of the above is not permitted, I'd appreciate knowing which parts, so I can adjust the
design rather than operate on a wrong assumption.

Thanks for building and maintaining SkillsMP — the occupation taxonomy in particular is a
genuinely useful piece of work.

Best regards,
[YOUR NAME]
AppMD — skill.appmd.dev
[CONTACT EMAIL]

---

## After you send

Record the outcome here and update the ledger:

- **Confirmed as read** → `DEC-004` becomes DECIDED, `RSK-002` closes.
- **Restricted** → raise a `CR-###`, adjust `REQ-004`, re-run G1 for the affected requirement.
- **No response within 30 days** → `DEC-004` stays ASSUMPTION; keep the conservative posture
  and record the non-response as evidence of good-faith enquiry. Do **not** silently upgrade the
  assumption because nobody objected.
