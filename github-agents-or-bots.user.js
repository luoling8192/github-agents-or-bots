// ==UserScript==
// @name         GitHub Automated Contributors
// @namespace    github-sidebar-agents-or-bots
// @version      1.2.1
// @description  Separate automated accounts from people in GitHub contributor lists.
// @homepageURL  https://github.com/luoling8192/github-automated-contributors
// @supportURL   https://github.com/luoling8192/github-automated-contributors/issues
// @downloadURL  https://raw.githubusercontent.com/luoling8192/github-automated-contributors/main/github-agents-or-bots.user.js
// @updateURL    https://raw.githubusercontent.com/luoling8192/github-automated-contributors/main/github-agents-or-bots.user.js
// @match        https://github.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  const panelAttribute = 'data-gh-bots-panel';
  const hiddenAttribute = 'data-gh-bots-original';
  // Editable exact-login rules, not a verified registry. All entries are lowercase.
  const agentLogins = new Set(['copilot', 'codex', 'openai-codex', 'claude', 'cursoragent']);
  // Exact, unlinked Git author names; these are labels, not verified identities.
  const agentAuthorNames = new Set(['codex', 'openai codex', 'claude', 'claude code']);
  const additionalBotLogins = new Set([]);
  // Overrides every automatic rule. Add false positives here, in lowercase.
  const humanLogins = new Set([]);
  const states = new Map();
  const graphStates = new Map();
  let timer;

  function isBotLogin(login, accountType = '') {
    const normalized = login.toLowerCase();
    if (humanLogins.has(normalized)) return false;
    return accountType.toLowerCase() === 'bot'
      || agentLogins.has(normalized)
      || additionalBotLogins.has(normalized)
      || /bot(?:\[bot\])?$/i.test(normalized);
  }

  function isBot(link) {
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin) return false;
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return false;
    }
    const avatar = link.querySelector('img');
    const login = path.replace(/^\//, '').replace(/\/$/, '').toLowerCase();
    if (isBotLogin(login)) return true;
    if (/^\/apps\/[^/]+\/?$/.test(path)) return true;
    if (link.dataset.hovercardType === 'bot') return true;
    if (/^\/[^/]+\[bot\]\/?$/i.test(path)) return true;
    if (avatar && /^@?[^\s]+\[bot\]$/i.test(avatar.alt.trim())) return true;
    if (!avatar) return false;
    const imageURL = new URL(avatar.getAttribute('src') || '', location.origin);
    return imageURL.hostname === 'avatars.githubusercontent.com' && /^\/in\/\d+(?:\/|$)/.test(imageURL.pathname);
  }

  function restore(state) {
    state.panel?.remove();
    for (const item of state.list.querySelectorAll(`[${hiddenAttribute}]`)) {
      item.removeAttribute(hiddenAttribute);
    }
  }

  function reset() {
    for (const state of states.values()) restore(state);
    states.clear();
    for (const [list, state] of graphStates) restoreGraph(list, state);
    graphStates.clear();
  }

  function restoreGraph(list, state) {
    state.controls.remove();
    state.agentList.remove();
    list.removeAttribute('data-gh-bots-list-hidden');
    for (const item of list.children) item.removeAttribute('data-gh-bots-filtered');
  }

  async function loadContributors(owner, repo) {
    const cacheKey = `gh-agents-or-bots:v2:${owner}/${repo}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
    const response = await fetch(`/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/graphs/contributors-data`, {
      headers: {Accept: 'application/json'},
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('GitHub contributor stats are not ready');
    const contributors = data.map(entry => ({
      login: entry.author?.login || null,
      avatar: entry.author?.avatar || '',
      url: entry.author?.path ? new URL(entry.author.path, location.origin).href : '',
      commits: entry.total,
    })).reverse().map((entry, index) => ({...entry, rank: index + 1}));
    sessionStorage.setItem(cacheKey, JSON.stringify(contributors));
    return contributors;
  }

  function makeAgentCard(entry, itemClass) {
    const item = document.createElement('li');
    item.className = `${itemClass} gh-bots-agent-card`;
    const profile = document.createElement('a');
    profile.href = entry.url;
    profile.className = 'gh-bots-agent-profile';
    const avatar = document.createElement('img');
    avatar.src = entry.avatar;
    avatar.alt = '';
    avatar.width = 40;
    avatar.height = 40;
    const details = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = entry.login;
    const commits = document.createElement('span');
    commits.textContent = `${entry.commits.toLocaleString()} commits`;
    details.append(name, commits);
    const rank = document.createElement('span');
    rank.className = 'gh-bots-agent-rank';
    rank.textContent = `#${entry.rank}`;
    profile.append(avatar, details, rank);
    item.append(profile);
    return item;
  }

  function renderGraphs() {
    const route = location.pathname + location.search;
    const active = /^\/[^/]+\/[^/]+\/graphs\/contributors\/?$/.test(location.pathname);
    for (const [list, state] of graphStates) {
      if (!active || state.route !== route || !list.isConnected) {
        restoreGraph(list, state);
        graphStates.delete(list);
      }
    }
    if (!active) return;
    for (const list of document.querySelectorAll('ul[class*="chartList"]:not([data-gh-bots-agent-list])')) {
      let state = graphStates.get(list);
      if (!state) {
        const controls = document.createElement('section');
        controls.className = 'gh-bots-controls';
        controls.setAttribute('aria-label', 'Contributor groups');
        const humans = document.createElement('button');
        const agents = document.createElement('button');
        for (const button of [humans, agents]) {
          button.type = 'button';
          button.className = 'btn';
        }
        const status = document.createElement('span');
        status.className = 'gh-bots-status';
        status.textContent = 'Loading…';
        controls.append(humans, agents, status);
        const agentList = list.cloneNode(false);
        agentList.removeAttribute('id');
        agentList.setAttribute('data-gh-bots-agent-list', '');
        agentList.hidden = true;
        state = {route, controls, humans, agents, status, agentList, mode: 'humans', contributors: null};
        const setMode = mode => {
          state.mode = mode;
          list.toggleAttribute('data-gh-bots-list-hidden', mode === 'agents');
          agentList.hidden = mode !== 'agents';
          humans.setAttribute('aria-pressed', String(mode === 'humans'));
          agents.setAttribute('aria-pressed', String(mode === 'agents'));
        };
        humans.onclick = () => setMode('humans');
        agents.onclick = () => setMode('agents');
        setMode('humans');
        graphStates.set(list, state);
        list.after(agentList);
        const [, owner, repo] = location.pathname.split('/');
        loadContributors(owner, repo).then(contributors => {
          if (!list.isConnected || graphStates.get(list) !== state) return;
          state.contributors = contributors;
          const bots = contributors.filter(entry => entry.login && isBotLogin(entry.login));
          humans.textContent = `Contributors (${contributors.length - bots.length})`;
          agents.textContent = `Automated contributors (${bots.length})`;
          status.remove();
          const itemClass = list.firstElementChild?.className || '';
          agentList.replaceChildren(...bots.map(entry => makeAgentCard(entry, itemClass)));
          renderGraphs();
        }).catch(() => {
          if (graphStates.get(list) === state) status.textContent = 'Could not load contributors.';
        });
      }
      if (!state.controls.isConnected) list.before(state.controls);
      for (const item of list.children) {
        const heading = item.querySelector('h2');
        if (!heading) continue;
        const profile = heading.querySelector('a[href]');
        const avatarLink = item.querySelector('a[data-hovercard-url]');
        const author = heading.cloneNode(true);
        for (const hidden of author.querySelectorAll('.sr-only')) hidden.remove();
        const bot = profile
          ? isBot(avatarLink || profile)
          : agentAuthorNames.has(author.textContent.trim().toLowerCase()) || /bot(?:\[bot\])?$/i.test(author.textContent.trim());
        item.toggleAttribute('data-gh-bots-filtered', bot);
      }
    }
  }

  function render() {
    renderGraphs();
    const route = location.pathname;
    const home = /^\/[^/]+\/[^/]+\/?$/.test(route);
    for (const [section, state] of states) {
      if (!home || state.route !== route || !section.isConnected || !section.contains(state.list)) {
        restore(state);
        states.delete(section);
      }
    }
    if (!home) return;
    const repo = route.replace(/\/$/, '');
    for (const heading of document.querySelectorAll('h2')) {
      if (heading.closest(`[${panelAttribute}]`)) continue;
      const headingLink = heading.querySelector('a[href]');
      if (!headingLink || new URL(headingLink.href).pathname !== `${repo}/graphs/contributors`) continue;
      const section = heading.parentElement;
      const list = section.querySelector('ul');
      if (!list) continue;
      const items = [...list.children].filter(item => item.tagName === 'LI');
      const bots = items.filter(item => {
        const link = item.querySelector('a[href]');
        return link && isBot(link);
      });
      const signature = bots.map(item => item.outerHTML.replaceAll(` ${hiddenAttribute}=""`, '')).join('');
      const previous = states.get(section);
      if (previous && previous.signature === signature && (!bots.length || previous.panel?.isConnected)
        && items.every(item => item.hasAttribute(hiddenAttribute) === bots.includes(item))) continue;
      if (previous) restore(previous);
      const state = { route, list, signature, panel: null };
      states.set(section, state);
      if (!bots.length) continue;

      const panel = document.createElement('div');
      panel.className = section.className;
      panel.setAttribute(panelAttribute, '');
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', 'Automated contributors');
      const title = heading.cloneNode(false);
      title.removeAttribute('id');
      title.textContent = 'Automated contributors ';
      const nativeCount = heading.querySelector('[data-component="CounterLabel"], .Counter');
      const count = nativeCount ? nativeCount.cloneNode(false) : document.createElement('span');
      count.removeAttribute('id');
      count.removeAttribute('aria-hidden');
      if (!nativeCount) count.className = 'Counter';
      count.textContent = String(bots.length);
      count.title = 'Automated accounts among the contributors shown on this page';
      title.append(count);
      const botList = list.cloneNode(false);
      botList.removeAttribute('id');
      for (const item of bots) {
        const copy = item.cloneNode(true);
        copy.removeAttribute(hiddenAttribute);
        for (const node of [copy, ...copy.querySelectorAll('[id]')]) node.removeAttribute('id');
        botList.append(copy);
        item.setAttribute(hiddenAttribute, '');
      }
      panel.append(title, botList);
      section.after(panel);
      state.panel = panel;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(render, 100);
  }

  const style = document.createElement('style');
  style.textContent = `[${hiddenAttribute}], [data-gh-bots-filtered], [data-gh-bots-list-hidden] { display: none !important; }
    .gh-bots-controls { display:flex; flex-wrap:wrap; gap:8px; }
    .gh-bots-status { align-self:center; font-size:12px; color:var(--fgColor-muted, #656d76); }
    .gh-bots-controls button[aria-pressed="true"] { outline:2px solid var(--fgColor-accent, #0969da); outline-offset:1px; }
    [data-gh-bots-agent-list] { margin-top:16px; }
    .gh-bots-agent-card { border:1px solid var(--borderColor-default, #d0d7de); border-radius:6px; }
    .gh-bots-agent-profile { display:flex; align-items:center; gap:12px; padding:16px; color:inherit; text-decoration:none; }
    .gh-bots-agent-profile img { border-radius:50%; }
    .gh-bots-agent-profile > span:nth-child(2) { display:flex; flex:1; flex-direction:column; }
    .gh-bots-agent-profile strong { color:var(--fgColor-accent, #0969da); }
    .gh-bots-agent-profile span span { color:var(--fgColor-muted, #656d76); font-size:12px; }
    .gh-bots-agent-rank { color:var(--fgColor-muted, #656d76); }`;
  document.head.append(style);
  const observer = new MutationObserver(records => {
    const relevant = records.some(record => {
      if (record.type === 'attributes') return true;
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest(`[${panelAttribute}], [data-gh-bots-agent-list]`)) return false;
      if (target?.matches('ul')) return true;
      return [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof Element && (node.matches('h2, ul') || node.querySelector('h2, ul')));
    });
    if (relevant) schedule();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href', 'src', 'alt', 'data-hovercard-type'],
  });
  document.addEventListener('turbo:before-cache', () => {
    clearTimeout(timer);
    observer.disconnect();
    reset();
  });
  document.addEventListener('turbo:load', () => {
    observer.observe(document.body, {childList: true, subtree: true, attributes: true,
      attributeFilter: ['href', 'src', 'alt', 'data-hovercard-type']});
    schedule();
  });
  document.addEventListener('soft-nav:render', schedule);
  window.addEventListener('popstate', schedule);
  render();
})();
