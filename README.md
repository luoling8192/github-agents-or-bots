# GitHub Automated Contributors

Separate automated accounts from people in GitHub contributor lists.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> The recommended Greasy Fork install link will appear here after the first
> release is published. Until then, use the direct GitHub installation below.

## Install

1. Install a userscript manager:
   [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/).
2. Install the userscript directly from
   [GitHub](https://raw.githubusercontent.com/luoling8192/github-automated-contributors/main/github-agents-or-bots.user.js).
3. Confirm the installation, then reload GitHub.

The Greasy Fork release will be the recommended installation source because it
provides a dedicated script page, update history, and an easier installation
flow. The raw GitHub link will remain available as a fallback.

## Preview

![GitHub repository sidebar with separate Contributors and Automated contributors panels](assets/preview.png)

## Features

- Moves bot avatars from a repository homepage's Contributors panel into an
  **Automated contributors** panel using GitHub's native layout.
- Adds **Contributors** and **Automated contributors** views to the full
  contributor graph.
- Uses GitHub's own contributor data endpoint to avoid fighting its virtualized
  list and causing layout flicker.
- Preserves the relative order and original rank of contributors.
- Requires no token, cross-site request, remote dependency, or privileged
  userscript grant.

## Supported pages

- `https://github.com/OWNER/REPOSITORY`
- `https://github.com/OWNER/REPOSITORY/graphs/contributors`
- `https://github.com/OWNER/REPOSITORY/graphs/contributors?all=1`

### Repository homepage limitation

The repository homepage only groups accounts already shown in GitHub's
Contributors preview. GitHub does not load the complete contributor list there,
so automated accounts outside that preview will not appear in the separate panel.
Use the contributor graph to view the complete grouping.

## Matching rules

The script recognizes:

- logins ending in `bot`, `-bot`, or `[bot]`;
- GitHub App profile links, bot hovercards, and GitHub App avatars;
- exact logins in `agentLogins` and `additionalBotLogins`.

The maintained automation login list currently includes `copilot`, `codex`,
`openai-codex`, `claude`, and `cursoragent`. Add false positives to
`humanLogins`; this override takes precedence over every automatic rule.

Matching is deliberately conservative. Automation using a normal person's
account cannot be inferred reliably.

## Feedback and development

Found a missed bot or an incorrectly classified contributor? Please
[open an issue](https://github.com/luoling8192/github-automated-contributors/issues).

To run the local fixture, serve the repository root, open `/test/repo/`, and
select **Run regression tests**. It covers homepage splitting, contributor graph
views, delayed rendering, navigation, Turbo cache restoration, and stable
automated contributor cards.

The userscript was validated against the current GitHub repository homepage and
Contributors page structures. GitHub can change that markup without notice.

## License

[MIT](LICENSE)
