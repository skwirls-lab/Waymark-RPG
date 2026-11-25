// Builds the Waymark site from ../Waymark-Rulebook.md into ./dist
import { marked } from 'marked';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'dist');
const rulebookPath = path.join(here, '..', 'Waymark-Rulebook.md');
const rulebook = fs.readFileSync(rulebookPath, 'utf8');

const APP_URL = 'https://waymark-rpg-app.web.app/';

const SMALL = new Set(['a', 'an', 'and', 'the', 'of', 'to', 'in', 'on', 'for', 'or']);
const titleCase = (s) =>
  s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// ---- Split the rulebook on top-level headings (ignoring code fences)
const chapters = [];
let current = null;
let inFence = false;
for (const line of rulebook.split('\n')) {
  if (line.startsWith('```')) inFence = !inFence;
  const m = !inFence && line.match(/^# (.+)$/);
  if (m) {
    current = { raw: m[1].trim(), lines: [] };
    chapters.push(current);
  } else if (current) {
    current.lines.push(line);
  }
}
const version = (rulebook.match(/\*Draft ([\d.]+)\*/) || [])[1] || '';
const pages = chapters.slice(1).map((c) => {
  const part = (c.raw.match(/^PART (\w+):/) || [])[1];
  const title = titleCase(c.raw.replace(/^PART \w+:\s*/, ''));
  return {
    title,
    part: part ? titleCase(part) : null,
    slug: slugify(title),
    md: c.lines.join('\n').replace(/\n---\s*$/, ''),
  };
});
if (pages.length < 5)
  throw new Error('Rulebook structure not recognised: found ' + pages.length + ' chapters');

// ---- Markdown to HTML, with heading anchors and scrollable tables
function render(md) {
  const sections = [];
  const used = new Set();
  let html = marked.parse(md);
  html = html.replace(/<h([234])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    let id = slugify(inner);
    while (used.has(id)) id += '-2';
    used.add(id);
    if (level === '2') sections.push({ id, text: inner.replace(/<[^>]+>/g, '') });
    return `<h${level} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`;
  });
  html = html
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>');
  return { html, sections };
}
for (const p of pages) Object.assign(p, render(p.md));

// The app's rules answers link to sections by address. Those addresses are
// worked out separately (rules/src/sections.ts), so make sure each one exists.
const sections = JSON.parse(
  fs.readFileSync(path.join(here, '..', 'rules', 'data', 'rulebook-sections.json'), 'utf8'),
);
for (const section of sections) {
  const [, , slug, anchor] = section.path.split('/');
  const page = pages.find((p) => p.slug === slug);
  if (!page || !page.html.includes(` id="${anchor.slice(1)}"`)) {
    throw new Error(`A rules answer would link to ${section.path}, which the site does not have.`);
  }
}

// ---- Templates
const logo = fs
  .readFileSync(path.join(here, 'src', 'logo.svg'), 'utf8')
  .replace('<svg ', '<svg class="logo" aria-hidden="true" ');

function layout({
  title,
  description,
  body,
  sidebar = '',
  active = '',
  search = true,
  bodyClass = '',
}) {
  const nav = [
    ['/rules/', 'Rules', 'rules'],
    ['/sheet/', 'Character sheet', 'sheet'],
    ['/about/', 'About', 'about'],
    [APP_URL, 'App (preview)', 'app'],
  ]
    .map(
      ([href, label, key]) =>
        `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
${search ? '<link rel="stylesheet" href="/pagefind/pagefind-ui.css">' : ''}
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="/">${logo}<span>Waymark</span></a>
  <nav class="site-nav" aria-label="Main">${nav}</nav>
  ${search ? '<div id="search" class="search"></div>' : ''}
</header>
<div class="shell${sidebar ? ' has-sidebar' : ''}">
${sidebar}
<main id="main">${body}</main>
</div>
<footer class="site-footer">
  <p>Waymark${version ? ' draft ' + version : ''}. Based on <a href="https://cairnrpg.com">Cairn</a> by Yochai Gal. Text licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. <a href="/about/">Credits</a> · <a href="/guide/">App guide</a> · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a></p>
</footer>
${
  search
    ? `<script src="/pagefind/pagefind-ui.js"></script>
<script>window.addEventListener('DOMContentLoaded',function(){new PagefindUI({element:'#search',showSubResults:true,showImages:false,translations:{placeholder:'Search the rules'}});});</script>`
    : ''
}
</body>
</html>`;
}

function sidebarFor(activeSlug) {
  const items = pages
    .map((p) => {
      const isActive = p.slug === activeSlug;
      const subs =
        isActive && p.sections.length
          ? `<ul>${p.sections.map((s) => `<li><a href="#${s.id}">${s.text}</a></li>`).join('')}</ul>`
          : '';
      return `<li><a href="/rules/${p.slug}/"${isActive ? ' aria-current="page"' : ''}>${p.title}</a>${subs}</li>`;
    })
    .join('');
  return `<aside class="sidebar"><details open><summary>Contents</summary><nav aria-label="Rulebook"><ul>${items}</ul><p class="side-extra"><a href="/rules/all/">Whole rulebook on one page</a></p></nav></details></aside>`;
}

function write(rel, html) {
  const file = path.join(out, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// ---- Build
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(path.join(here, 'src'))) {
  if (!f.endsWith('.html')) fs.copyFileSync(path.join(here, 'src', f), path.join(out, f));
}
fs.copyFileSync(rulebookPath, path.join(out, 'Waymark-Rulebook.md'));

// Rule pages
pages.forEach((p, i) => {
  const prev = pages[i - 1],
    next = pages[i + 1];
  const pager = `<nav class="pager" aria-label="Chapters">${prev ? `<a class="prev" href="/rules/${prev.slug}/"><small>Previous</small>${prev.title}</a>` : '<span></span>'}${next ? `<a class="next" href="/rules/${next.slug}/"><small>Next</small>${next.title}</a>` : '<span></span>'}</nav>`;
  const body = `<article class="prose" data-pagefind-body>${p.part ? `<p class="eyebrow">Part ${p.part}</p>` : ''}<h1>${p.title}</h1>${p.html}</article>${pager}`;
  write(
    `rules/${p.slug}/index.html`,
    layout({
      title: `${p.title} | Waymark`,
      description: `Waymark rulebook: ${p.title}.`,
      body,
      sidebar: sidebarFor(p.slug),
      active: 'rules',
    }),
  );
});

// Rules index
const toc = pages
  .map(
    (p) =>
      `<li><a href="/rules/${p.slug}/"><span class="toc-part">${p.part ? 'Part ' + p.part : '&nbsp;'}</span><strong>${p.title}</strong><span class="toc-subs">${p.sections.map((s) => s.text).join(' · ')}</span></a></li>`,
  )
  .join('');
write(
  'rules/index.html',
  layout({
    title: 'The Rules | Waymark',
    description: 'The complete Waymark rulebook, free to read.',
    active: 'rules',
    body: `<div class="prose narrow"><h1>The rules</h1><p>The whole game is here and free to read. If you are new, start at the Introduction and read in order. It takes about an hour, and you can start playing after Part Two.</p></div><ol class="toc">${toc}</ol><p class="narrow center"><a href="/rules/all/">Read the whole rulebook on one page</a> · <a href="/Waymark-Rulebook.md" download>Download as a text file</a></p>`,
  }),
);

// Whole book on one page (also the print version)
const all = pages
  .map(
    (p) =>
      `<section><p class="eyebrow">${p.part ? 'Part ' + p.part : ''}</p><h1 id="${p.slug}">${p.title}</h1>${p.html.replace(/ id="/g, ` id="${p.slug}--`).replace(/href="#/g, `href="#${p.slug}--`)}</section>`,
  )
  .join('<hr>');
write(
  'rules/all/index.html',
  layout({
    title: 'The Whole Rulebook | Waymark',
    description: 'The complete Waymark rulebook on a single page.',
    active: 'rules',
    search: false,
    body: `<article class="prose"><p class="print-hide"><a href="/rules/">Back to the contents</a> · <button class="link" onclick="window.print()">Print this page</button></p>${all}</article>`,
  }),
);

// Hand-written pages
// The legal name, contact address and governing law, as John supplied them.
const vars = {
  '{{VERSION}}': version,
  '{{LOGO}}': logo,
  '{{FIRST}}': `/rules/${pages[0].slug}/`,
  '{{LEGAL_NAME}}': 'Skwirls Ventures LLC',
  '{{CONTACT}}': '<a href="mailto:support@skwirls.com">support@skwirls.com</a>',
  '{{JURISDICTION}}':
    'the United States and of the state in which Skwirls Ventures LLC is registered',
  '{{APP_HOST}}': 'waymark-rpg-app.web.app',
  '{{SITE_HOST}}': 'waymark-rpg.web.app',
  '{{APP_URL}}': APP_URL,
};
const fill = (s) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(k).join(v), s);
const src = (name) => fill(fs.readFileSync(path.join(here, 'src', name), 'utf8'));
write(
  'index.html',
  layout({
    title: 'Waymark: a roleplaying game for any world',
    description:
      'Waymark is a free tabletop roleplaying game that is easy to learn and works in any world you can imagine.',
    body: src('home.html'),
    bodyClass: 'home',
  }),
);
write(
  'sheet/index.html',
  layout({
    title: 'Character Sheet | Waymark',
    description: 'A printable Waymark character sheet.',
    body: src('sheet.html'),
    active: 'sheet',
    search: false,
  }),
);
write(
  'about/index.html',
  layout({
    title: 'About and Credits | Waymark',
    description: 'About Waymark, its license, and its debt to Cairn.',
    body: src('about.html'),
    active: 'about',
  }),
);
write(
  'guide/index.html',
  layout({
    title: 'Using the App | Waymark',
    description: 'A short guide to the Waymark app for players and Wardens.',
    body: src('guide.html'),
  }),
);
write(
  'privacy/index.html',
  layout({
    title: 'Privacy Policy (draft) | Waymark',
    description: 'What the Waymark app knows about you, and your choices.',
    body: src('privacy.html'),
  }),
);
write(
  'terms/index.html',
  layout({
    title: 'Terms of Use (draft) | Waymark',
    description: 'The terms for using the Waymark app.',
    body: src('terms.html'),
  }),
);
write(
  '404.html',
  layout({
    title: 'Page not found | Waymark',
    description: 'Page not found.',
    search: false,
    body: '<div class="prose narrow center"><h1>Off the trail</h1><p>That page does not exist. <a href="/">Head back to the start</a> or <a href="/rules/">open the rules</a>.</p></div>',
  }),
);

console.log(`Built ${pages.length} rule pages (draft ${version}) into dist/`);
