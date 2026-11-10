# Leaving Base44

A practical guide to taking an app off [Base44](https://base44.com): what Base44's exports give you, what they leave behind, a checklist before you start, and the ways people move. It comes with a small **export checker** that reads your exported code and lists everything it still needs Base44's servers for.

Last checked against Base44's documentation: November 2026.

**The short version:** Base44 lets you export your code (a ZIP or GitHub sync, on the Builder plan or higher) and your records (CSV, one table at a time, on any plan). None of the exports produces an app that runs without Base44. The exported code is a client for Base44's backend: sign-ins, records, functions, files, email and AI calls all still go to Base44's servers. Your users' passwords, your secrets' values, your uploaded files and your automations aren't in any export. Leaving means moving those too, and either rewriting the app's Base44 calls for another backend or running a backend that answers them the same way.

## Contents

- [Check your export](#check-your-export)
- [What Base44 lets you export](#what-base44-lets-you-export)
- [What stays on Base44](#what-stays-on-base44)
- [Users and passwords](#users-and-passwords)
- [Checklist before you leave](#checklist-before-you-leave)
- [Ways to move](#ways-to-move)
- [Questions](#questions)
- [Sources](#sources)

## Check your export

The checker reads the ZIP from Base44's **Code** tab, a GitHub-synced folder, or a CLI checkout, and lists what the app still runs on Base44: data tables, sign-in, backend functions, AI, email, text messages, files, live updates, agents, connectors and workflows. It also flags functions your code calls that are missing from the export.

It runs on your machine. No network calls, no dependencies, Node.js 18 or later:

```bash
git clone https://github.com/codama-dev/leaving-base44.git
cd leaving-base44
node checker/cli.mjs ~/Downloads/my-app.zip
```

Add `--json` for the full result as JSON. A folder works too: `node checker/cli.mjs ~/code/my-app`.

Example output, from the small sample app in `test/fixture-app`:

```text
Read 6 files, 3 of them code.
Base44 SDK: ^0.8.0

Still runs on Base44:
  - Data tables (2): Customer, Order. Records and access rules live in Base44's database.
  - Users and sign-in: Base44 holds the accounts and password hashes; providers in the code: google.
  - Backend functions (1): run on Base44's function runtime.
  - Missing functions: the code calls functions that aren't in this export: deletedLongAgo. They may have been deleted on Base44; those calls fail there too.
  - AI: InvokeLLM, billed as Base44 integration credits.
  - Sending email: sent by Base44.
  - Files: UploadFile, stored in Base44's storage.

Not in any export, so not counted here: your records, users and passwords, secret values, uploaded files and automations. They stay on Base44 until you move them. See the README for how.
```

Prefer not to use a terminal? The same checker runs in the browser at [unbase44.com/tools/base44-export-checker](https://unbase44.com/tools/base44-export-checker/). It reads the ZIP locally and uploads nothing.

## What Base44 lets you export

| Route | What you get | Plan |
| --- | --- | --- |
| **ZIP from the Code tab** | The frontend (a React and Vite project), backend function source, and table definitions | Builder or higher |
| **Two-way GitHub sync** | The same code, kept in a repository you choose. Table definitions aren't synced | Builder or higher |
| **`base44 eject`** (CLI) | A copy of the app as a *new, separate Base44 project* with its own app ID and an empty database | Not stated |
| **CSV export** (Data dashboard) | One table's records per export | Any, Free included |
| **Apps API** | Records and the user list, read by a script with a personal API key; at most 5,000 items per request | Not stated; the API is in beta |

On the Free plan, records are the only thing you can take out through the dashboard. The usual route for the code is one month of Builder on **monthly** billing (Base44's terms treat yearly fees as non-refundable), export everything, then downgrade. A downgrade takes effect at the end of the billing period.

## What stays on Base44

| Part of the app | In the ZIP or GitHub sync? | Where it lives |
| --- | --- | --- |
| Frontend code | Yes | Your download or repository |
| Backend function code | Yes, as source files | Runs on Base44's function runtime |
| Table definitions | In the ZIP; not in GitHub sync | Base44 |
| Records | No; CSV one table at a time, or the API | Base44's database |
| Users and passwords | No | Base44's sign-in service |
| Secret values | No; Base44 never shows them again | Base44's secrets store |
| Uploaded files | No; your records hold links to them | Base44's file storage |
| Automations and workflows | Definitions at most; the runner isn't | Base44's scheduler |
| AI features and agents | The calls in your code | Base44's integrations, billed in credits |
| Connectors (Gmail, Slack and others) | No | OAuth tokens held by Base44 |

**Why exported code still calls Base44.** A Base44 frontend talks to its backend through the [Base44 SDK](https://github.com/base44/javascript-sdk). `src/api` creates a client with your app's ID, and every data call becomes an HTTP request to Base44's API. Backend functions use the same SDK. Running the code elsewhere means either rewriting every SDK call for a different backend, or running a backend that answers those calls the same way Base44 does.

**Records and links between tables.** Relationships in Base44 are IDs stored in fields. Keep the original IDs when you import your records elsewhere, or the links between tables break. The dashboard's table view stops at 5,000 rows; the CSV export doesn't.

## Users and passwords

Base44's documentation says app users can't be exported. You can read each user's record (ID, email, name, role, when they joined, plus custom fields) through the Apps API's *List app users* endpoint, a backend function using `asServiceRole`, or an owner-only page in your app. Password hashes never leave Base44.

That leaves three ways to bring users across:

1. **Ask everyone to reset their password.** Simple, but each user has to act on an email before they can get back in, and some won't. Rebuilds on another stack usually end up here.
2. **Switch to sign-in codes or magic links.** No password to move, but a different sign-in experience for everyone.
3. **Check each password against Base44 the first time it's used.** The user signs in as usual, Base44 confirms the password once, and the new system stores its own hash. This only works while the Base44 app is still running, so keep it on the Free plan until your active users have signed in once.

Google sign-in can move too, with your own Google OAuth client. Users who signed in with Apple and hid their email from Apple are the hardest case: the relay address is tied to the original developer account.

## Checklist before you leave

- [ ] Check your plan: the ZIP and GitHub sync need Builder or higher.
- [ ] Export every table to CSV and keep the files somewhere safe, whatever else you decide.
- [ ] Run the checker on your export and note the functions it says are missing.
- [ ] Write down the **names** of your secrets (the values can't be exported) and where each one came from.
- [ ] List your automations, workflows and connectors, and what each one does.
- [ ] List what your app sends by email or text message, and from which address.
- [ ] Note your custom domain's DNS records, so you can point the domain elsewhere later.
- [ ] If you take payments, note how they reach your app (Stripe webhooks, for example): those addresses change when the app moves.
- [ ] Decide how users will sign in after the move (see [Users and passwords](#users-and-passwords)).
- [ ] Keep the Base44 app running until the new one is live and your users have moved.

## Ways to move

There are five kinds of route off Base44. Which fits depends on whether you want the same app working as it is, a different stack, or someone else doing the work.

1. **Rebuild it yourself on another stack.** Base44's exports plus Supabase or Firebase, with your frontend on Vercel or similar. Free apart from your time, but you rewrite the data layer, the security rules and the functions, and users usually reset their passwords.
2. **An automated service that copies the whole app** onto accounts you own, with your records, users and functions. Some keep a Base44-compatible backend so the app isn't rewritten; others move it onto Supabase.
3. **An agency or freelancer** who moves or rewrites the app for you, from fixed low prices for a straight move to five-figure planned rewrites.
4. **Another platform's import**, such as Replit's, if you want to keep building with an AI agent and can recreate your data.
5. **A free tool for one piece**, when you only need a backup of your code or your data.

A side-by-side comparison of every option we know of, with what each says it moves and its published price, is kept at [unbase44.com/articles/base44-migration-tools](https://unbase44.com/articles/base44-migration-tools/).

**Disclosure:** this repository is maintained by [Codama](https://codama.dev), which makes [Unbase44](https://unbase44.com), one of the automated services in that comparison. The guide and the checker are useful whichever route you take.

## Questions

**Does the Base44 export include my data?**
No. The ZIP and GitHub sync contain code. Records come out separately as CSV, one table at a time, or through the API. Users, passwords, secret values, uploaded files and automations aren't in any export.

**Can I run the exported code without Base44?**
Not as it is. It uses the Base44 SDK, which sends data, sign-in, function and integration requests to Base44's servers. You need either a rewrite of those calls or a backend that answers them the same way.

**Can I export my Base44 app on the Free plan?**
Your records, yes, as CSV. The code, not through any documented route: the ZIP and GitHub sync need Builder or higher. One month of Builder on monthly billing, then a downgrade, is the usual answer.

**Will my users have to reset their passwords?**
It depends on how you move. Base44 doesn't export password hashes, so a rebuild usually means a reset for everyone. A move that checks each password against Base44 on first sign-in avoids it, as long as the Base44 app is still running.

**Does `base44 eject` copy my data?**
No. It creates a new Base44 project with its own app ID and an empty database. Schemas are copied; records aren't.

**Is GitHub sync the same as migrating off Base44?**
No. The repository holds your frontend and function source. Your records, users, secrets, files, connectors and the scheduler stay on Base44, and the code still calls Base44.

## Sources

Base44's own documentation, checked November 2026:

- [Developer tools (ZIP export and plan requirement)](https://docs.base44.com/documentation/building-your-app/developer-tools)
- [Project structure](https://docs.base44.com/developers/app-code/overview/project-structure)
- [GitHub integration (sync rules)](https://docs.base44.com/developers/app-code/local-development/github)
- [CLI: eject](https://docs.base44.com/developers/references/cli/commands/eject)
- [Managing your app data (CSV export, 5,000-item view)](https://docs.base44.com/Building-your-app/Managing-your-app-data)
- [Privacy and security (app users can't be exported)](https://docs.base44.com/Community-and-support/Privacy-and-security)
- [List app users (Apps API)](https://docs.base44.com/api-reference/list-app-users)
- [Billing and plans (upgrades, downgrades, cancelling)](https://docs.base44.com/Account-and-billing/Billing-and-plans)
- [Pricing](https://base44.com/pricing)
- [Base44 JavaScript SDK (MIT)](https://github.com/base44/javascript-sdk)

Found something out of date? Open an issue or a pull request.

## License

MIT. See [LICENSE](LICENSE).
