# Third-party notices

Copyright in original LessonLedger work remains with Vardhan. Dependencies and fonts retain their own licenses. Installing the project preserves license files in the dependency packages; source notices must not be removed during redistribution.

The UI bundles **DM Sans** and **Newsreader** through Fontsource. Their SIL Open Font License texts are copied into `docs/licenses/`. The original page/revision identity and editorial illustrations were created in this repository. Lucide icons retain the ISC license included in the `lucide-react` package.

The lockfile records all exact transitive versions. Core packages include Next.js and React, Better Auth, Knex, better-sqlite3, PostgreSQL's JavaScript driver, Zod, Cheerio, ipaddr.js, pdf-parse, pdf-lib, OpenAI's SDK, Stripe's SDK, Nodemailer and the AWS SDK. Refer to each installed package's `LICENSE` or `LICENSE.md` for complete terms. No third-party ownership or attribution is replaced by the project’s branding.

Production operators must also comply with provider service terms and their own authorization to process lesson and source content.

PDF exports also embed a subset of the full DM Sans font from the Google Fonts repository, distributed under the same SIL Open Font License. Original source: https://github.com/google/fonts/tree/main/ofl/dmsans. Unsupported glyphs cause an explicit error with a Markdown/CSV alternative; source text is never silently removed.
