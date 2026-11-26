import { relevantSections, rulebookSections, type Section } from '@waymark/rules';
import { marked } from 'marked';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const SITE = 'https://waymark-rpg.web.app';

/** A section's text as a page. The text is the rulebook's own, so it is safe to show as written. */
function Text({ section }: { section: Section }) {
  const html = useMemo(() => marked.parse(section.text, { async: false }), [section]);
  return <div className="rules-text" dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * The rulebook, for looking something up in the middle of play. It opens on
 * the one-page reference; a search finds the section that covers a question.
 */
export function Rules() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const reference = rulebookSections.filter((s) => s.chapter === 'Reference');
  const found = query.trim().length >= 2 ? relevantSections(query, rulebookSections, 6) : null;
  const chapters = [...new Set(rulebookSections.map((s) => s.chapter))];
  const shown = open ? rulebookSections.find((s) => s.id === open) : undefined;

  const list = (sections: readonly Section[]) => (
    <ul className="record">
      {sections.map((s) => (
        <li key={s.id}>
          <button type="button" className="link-button" onClick={() => setOpen(s.id)}>
            {s.title}
          </button>
          <span className="muted"> {s.chapter}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="screen">
      <p className="back">
        <button type="button" className="link-button" onClick={() => navigate(-1)}>
          ← Back to the game
        </button>
      </p>
      <h1>Rules</h1>
      <label className="form-row">
        Look something up
        <input
          type="search"
          value={query}
          placeholder="fighting, rest, Fatigue, morale…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(null);
          }}
        />
      </label>

      {shown ? (
        <section aria-labelledby="rule">
          <p className="eyebrow">{shown.chapter}</p>
          <h2 id="rule">{shown.title}</h2>
          <Text section={shown} />
          <p className="button-row">
            <button type="button" className="button small" onClick={() => setOpen(null)}>
              Back to the list
            </button>
            <a className="button small as-link" href={`${SITE}${shown.path}`}>
              Open in the full rulebook
            </a>
          </p>
        </section>
      ) : found ? (
        <section aria-labelledby="found">
          <h2 id="found">Where the rulebook covers it</h2>
          {found.length === 0 ? (
            <p className="muted">Nothing in the rulebook uses those words. Try others.</p>
          ) : (
            list(found)
          )}
        </section>
      ) : (
        <>
          <section aria-labelledby="quick">
            <h2 id="quick">Quick reference</h2>
            {reference.map((s) => (
              <details key={s.id} open={reference.length === 1}>
                <summary>{s.title}</summary>
                <Text section={s} />
              </details>
            ))}
          </section>
          <section aria-labelledby="all">
            <h2 id="all">The whole book</h2>
            {chapters
              .filter((c) => c !== 'Reference')
              .map((chapter) => (
                <details key={chapter}>
                  <summary>{chapter}</summary>
                  {list(rulebookSections.filter((s) => s.chapter === chapter))}
                </details>
              ))}
          </section>
        </>
      )}
      <p className="fineprint">
        <Link to="/">Home</Link> · <a href={`${SITE}/rules/`}>The full rulebook on the web</a>
      </p>
    </main>
  );
}
