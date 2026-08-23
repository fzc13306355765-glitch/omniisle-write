<p align="center">
  <img src="LOGO-256.png" width="112" alt="Omniisle Write logo">
</p>

<h1 align="center">Omniisle Write</h1>

<p align="center">
  A local-first workspace for Chinese long-form fiction: organize projects, build outlines and memory, draft chapters, refine prose, and analyze complete manuscripts.
</p>

<p align="center">
  <a href="https://github.com/fzc13306355765-glitch/omniisle-write/actions/workflows/ci.yml"><img alt="Checks passing" src="https://img.shields.io/badge/checks-passing-2f855a"></a>
  <a href="LICENSE"><img alt="AGPL-3.0-only license" src="https://img.shields.io/badge/license-AGPL--3.0--only-2f855a"></a>
  <img alt="Local-first data" src="https://img.shields.io/badge/data-local--first-2563eb">
  <img alt="Bring your own model" src="https://img.shields.io/badge/AI-BYOK-7c3aed">
  <a href="https://github.com/fzc13306355765-glitch/omniisle-write"><img alt="Private GitHub release candidate" src="https://img.shields.io/badge/GitHub-private-6e40c9"></a>
</p>

<p align="center">
  <a href="README.md">简体中文</a> · English ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="https://www.omniisle.com/">Hosted edition</a>
</p>

> [!IMPORTANT]
> This is the `0.1.0-alpha.1` community candidate. The interface, built-in prompts, and workflow currently target Chinese web fiction. It does not include Omniisle accounts, cloud sync, login, credits, payments, an admin console, or a hosted model. Configure your own compatible model API to use AI features.

![Omniisle Write editor and long-form writing workspace](docs/images/omniisle-editor.png)

## Why Omniisle Write

Long-form fiction needs more than a text box. Projects, volumes, chapters, outlines, character facts, linked references, revision history, and manuscript-wide analysis must remain connected throughout the writing process.

Omniisle Write Community Edition keeps that workflow in the local browser. It requires no registration and does not depend on the hosted Omniisle backend. The local writing tools work without AI; connect a model service only when you need generation or analysis.

| Writing stage | Community features |
| --- | --- |
| Project organization | Projects, volumes, chapters, archive, trash, search, and batch management |
| Story planning | Standard and advanced outlines, stage outlines, scene outlines, characters, worldbuilding, and other structured generators |
| Context management | Memory books, linked files, previous-chapter references, prompt templates, and user templates |
| Drafting | Chapter generation, rich-text editing, autosave, version history, search and replace, and formatting |
| Revision | Partial polish, partial rewrite, AI detection, plot lock, AI optimization, and Naturalize I / II |
| Manuscript analysis | Chapter import, scope selection, automatic or staged execution, local checkpoints, and eight analysis outputs |
| Local operation | Import and export, backups, light and dark themes, appearance controls, and an interactive tutorial |

## Screenshots

These images come from the real community candidate. All titles, cover art, and manuscript text shown here are demonstration content.

<table>
  <tr>
    <td width="50%">
      <img src="docs/images/omniisle-overview.png" alt="Project overview, recent chapters, and writing activity">
      <br><strong>Project overview</strong><br>Manage projects, recent chapters, writing activity, archives, and trash in one place.
    </td>
    <td width="50%">
      <img src="docs/images/omniisle-ai-polish.png" alt="AI detection, plot lock, and AI optimization">
      <br><strong>Reviewable AI revision</strong><br>Naturalize I runs AI detection, plot lock, and optimization; results replace the draft only after confirmation.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/images/omniisle-full-analysis.png" alt="Full-manuscript analysis setup">
      <br><strong>Full-manuscript analysis</strong><br>Select a chapter scope and execution mode; progress and eight outputs remain in local checkpoints.
    </td>
    <td width="50%">
      <img src="docs/images/omniisle-model-setup.png" alt="Bring-your-own-model configuration">
      <br><strong>Bring your own model</strong><br>Provide a vendor, base URL, API key, and model ID. Long-term key storage is disabled by default.
    </td>
  </tr>
</table>

## Quick start

### Requirements

- Node.js 20 or later
- Desktop Chrome or Microsoft Edge; the current candidate has been tested on Windows

### Run the community edition

```bash
git clone https://github.com/fzc13306355765-glitch/omniisle-write.git
cd omniisle-write
npm ci
npm run build
npm run serve
```

Open the local address printed in the terminal, normally <http://127.0.0.1:8081/>. Do not open `index.html` directly; browser storage and module loading may not work correctly.

The tutorial entry at the top of the application uses isolated demonstration data. It does not call a model or write into real projects.

## Configure your model

1. Select “Add your own model” on the writing screen.
2. Choose a provider or the custom relay option.
3. Enter the base URL, API key, and model ID, then save.
4. Select the saved model in drafting, tool-model, or full-analysis controls as needed.
5. Confirm the displayed destination domain before the first request and only send manuscripts to endpoints you trust.

API keys remain in the current page session by default and must be entered again after the page is refreshed or closed. A key is encrypted and persisted in the current browser only after the user explicitly enables and confirms “Remember API key.” Availability, quotas, and charges are controlled by the selected provider; this repository supplies no model credits.

## Data, privacy, and backups

- Projects, chapters, templates, version history, and analysis checkpoints are stored in the current browser.
- Clearing browser data, reinstalling the browser, or moving to another computer can remove local manuscripts. Export backups regularly.
- The community edition blocks unconfirmed external requests by default. AI content is sent only to the endpoint confirmed by the user and does not pass through Omniisle servers.
- User-imported manuscripts, prompts, images, API keys, and model settings are not part of this repository and are not open-sourced by using the application.
- The community edition contains no accounts, cloud storage, billing, payment, operations data, or administration backend.

See [PRIVACY.md](PRIVACY.md), [the open-source full-analysis notes](docs/full-analysis-open-source-notices.md), and [OPEN-SOURCE-STATUS.md](OPEN-SOURCE-STATUS.md) for the detailed boundaries.

## Choose the right edition

| Edition | Best for | What it provides |
| --- | --- | --- |
| GitHub community edition | Writers and developers willing to run the app and configure a model | Local writing and bring-your-own API, without Omniisle accounts or cloud services |
| [Omniisle Write Hosted](https://www.omniisle.com/) | Writers who want a maintained browser service | Separate hosted accounts, billing, online services, and ongoing maintenance |
| Enterprise on-premises deployment | Organizations with defined confidentiality, internal-permission, or collaboration needs | A separately evaluated internal system; it is not included in this repository |

This repository contains only the community edition. Publishing it does not make the hosted service free and does not require hosted backend code, customer data, or commercial operations code to be published. See [COMMERCIAL.md](COMMERCIAL.md).

## Status and roadmap

- Current version: `0.1.0-alpha.1`
- Publication status: local candidate gates are **GO**; see [OPEN-SOURCE-STATUS.md](OPEN-SOURCE-STATUS.md)
- Verified: Chrome, Microsoft Edge, local writing, API-key boundaries, the AI optimization chain, and full-manuscript analysis
- Not yet provided: a signed installer, cloud sync, hosted models, or an English application interface

See [ROADMAP.md](ROADMAP.md) for planned work and [CHANGELOG.md](CHANGELOG.md) for version history.

## Contributing

- General help: read [SUPPORT.md](SUPPORT.md), then open a reproducible [GitHub Issue](https://github.com/fzc13306355765-glitch/omniisle-write/issues)
- Security reports: follow [SECURITY.md](SECURITY.md); never publish manuscripts, API keys, or exploitable details in an issue
- Code contributions: read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [CLA.md](CLA.md)
- Commercial licensing: see [COMMERCIAL.md](COMMERCIAL.md) for closed-source integration or alternative terms

If this project helps you, consider starring it, reporting reproducible issues, or contributing an improvement.

## Development and verification

```bash
npm test
npm run licenses:check
npm run secrets:check
npm run audit:public
```

These checks cover the community runtime, local-writing boundary, full-text analysis, API-key persistence, third-party licenses, secrets, and the public repository boundary. They should remain green before every public commit. Maintainer-only setup is documented in [GITHUB-SETUP.md](GITHUB-SETUP.md).

## License and rights

Except for third-party components and separately documented assets, code created or lawfully owned by Zeyu is published under the [GNU Affero General Public License v3.0](LICENSE) only (`AGPL-3.0-only`). Closed-source integration or alternative terms may be licensed separately in writing by the rights holder. External contributions require acceptance of the [Contributor License Agreement](CLA.md).

The same license does not automatically cover the logo, wallpaper, tutorial cover, documentation screenshots, trademarks, or third-party components. Before redistribution, read [ASSETS-LICENSES.md](ASSETS-LICENSES.md), [TRADEMARKS.md](TRADEMARKS.md), [NOTICE](NOTICE), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
