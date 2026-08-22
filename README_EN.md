# Omniisle Write Community Edition

[简体中文](README.md) | English

> This directory has passed the local technical release gates and can be used as the GitHub community source repository. The rights holder should still review the final commit and private asset provenance records before the first public upload.

Omniisle Write Community Edition is a local-first desktop writing workspace for Chinese long-form fiction. Manuscripts are stored in the current browser. No Omniisle Write account is required, and the community edition does not connect to the hosted Omniisle Write backend. To use AI features, users provide their own model endpoint, model name, and API key.

The application interface, built-in prompts, and writing workflow currently focus on Chinese web novels. This English document does not mean that the application has been fully localized into English.

## Choose the right edition

| Edition | Best for | What it provides |
| --- | --- | --- |
| GitHub community edition | Individuals and developers who can install the app and configure a model | Local use, bring-your-own API, no Omniisle Write account or cloud service |
| Omniisle Write hosted edition | Writers who want a managed online service | Hosted accounts, billing, online services, and ongoing maintenance, separate from this repository |
| Enterprise on-premises deployment | Organizations with confidentiality, multi-user, or internal-management requirements | A separately evaluated internal system; it is not included in this repository |

This repository contains only the community edition. See [COMMERCIAL.md](COMMERCIAL.md) for the boundary between the community, hosted, and enterprise offerings.

## Run locally

Node.js 20 or later is required.

```bash
npm ci
npm run build
npm run serve
```

Open the local address printed in the terminal. Do not open `index.html` directly because browser storage and module loading may not work correctly.

## Included features

- Local projects, volumes, and chapter management
- Editing, autosave, version history, import, and export
- Outlines, memory books, templates, search and replace, and formatting tools
- Bring-your-own-model drafting, rewriting, polishing, and full-text analysis
- Local checkpoints and eight saved outputs from full-text analysis

## Data and network boundaries

- Manuscripts are stored in the current browser. Clearing browser data can remove them, so export backups regularly.
- External network requests are blocked by default. Before the first request, the application displays the destination domain and asks the user to confirm it.
- API keys and writing content should only be sent to the model endpoint confirmed by the user. They do not pass through Omniisle Write servers.
- The community edition does not include accounts, cloud sync, credits, top-ups, payments, or an administration console.
- The repository does not include an AI model service. Any API availability, limits, or charges are determined by the provider selected by the user.

## Verify the candidate

```bash
npm test
npm run audit:public
```

`npm test` checks the community runtime, local writing boundary, and full-text analysis flow. `npm run audit:public` checks for secrets, hosted-service code, commercial implementation, extra networking, and missing assets. Both should remain green before every public commit.

## Support and security

Read [SUPPORT.md](SUPPORT.md) before opening a general issue. If a problem could expose manuscripts, API keys, or network restrictions, follow [SECURITY.md](SECURITY.md) and do not publish sensitive details in an issue.

## License

Except for third-party components and assets noted separately, Omniisle Write Community Edition code created or lawfully owned by Zeyu is Copyright (C) 2026 Zeyu and is licensed under the [GNU Affero General Public License v3.0](LICENSE) only (`AGPL-3.0-only`). External contributors retain copyright in their contributions and license them to the project under the [Contributor License Agreement](CLA.md).

Commercial licensing for closed-source integration or other terms is available separately from the rights holder. External contributions require acceptance of the [Contributor License Agreement](CLA.md). The project code license does not automatically cover logos, wallpapers, trademarks, or third-party components; see [ASSETS-LICENSES.md](ASSETS-LICENSES.md), [TRADEMARKS.md](TRADEMARKS.md), and [NOTICE](NOTICE).

See [OPEN-SOURCE-STATUS.md](OPEN-SOURCE-STATUS.md) for the verified technical scope and the ownership checks that remain the rights holder's responsibility.
