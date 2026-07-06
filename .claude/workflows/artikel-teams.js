export const meta = {
  name: 'artikel-teams',
  description: 'Nuechternen Autobot-Artikel aus einem Prompt/einer Aussage schreiben und durch 8 Grounding-Review-Teams in 2 Runden haerten',
  whenToUse: 'Bei JEDER neuen Artikel-Erzeugung aus einem Prompt/einer Aussage. args.statement = die Aussage/das Thema. Gibt finalen Artikel (title, dek, summary, hashtags, bodyMarkdown) + alle Review-Runden zurueck.',
  phases: [
    { title: 'Grounding', detail: 'Beide Groundings themenfokussiert + Prior-Art digestieren' },
    { title: 'Entwurf', detail: 'Artikel v1 schreiben' },
    { title: 'Review-1', detail: '8 Teams reviewen v1' },
    { title: 'Synthese', detail: 'Feedback in v2 integrieren' },
    { title: 'Review-2', detail: '8 Teams verifizieren v2 adversarisch' },
    { title: 'Finale', detail: 'v3 mit Gate-Selbstpruefung' },
  ],
}

const ROOT = '/home/user/Code/einundzwanzig-autobot'

// args-Vertrag: { statement: string (Pflicht), sessionsDir?: string }
const STATEMENT = (args && typeof args === 'object' && args.statement)
  ? args.statement
  : (typeof args === 'string' ? args : null)
if (!STATEMENT) {
  throw new Error('artikel-teams: args.statement (die Aussage/das Thema) fehlt.')
}
const SESSIONS_DIR = (args && args.sessionsDir) ? args.sessionsDir : `${ROOT}/sessions`

const HARD = `HARDE REGELN (Pflicht, vor allem anderen):
- Sprache: Deutsch.
- KEINE Gedankenstriche. Weder Halbgeviert noch Geviert, auch nicht als Einschub mit Leerzeichen. Gedanken als eigenen Satz mit Punkt, oder per Komma/Doppelpunkt/Klammer. Gewoehnlicher Bindestrich in Woertern (kind-1-Note) bleibt erlaubt.
- VERBOTENE WOERTER (nie im Text): "horten/Hortung/Hort/enthorten" (stattdessen: halten, zuruecklegen, aufbewahren, Bestaende, Kasse halten), "Gemeinwohl" und kollektivistische "Wohl der Gesellschaft"-Formeln, "stoisch/Stoizismus" und jedes Selbst-Label der Haltung, "Voskuil", "Hearn-Fehler", "Etatismus".
- STILLES GROUNDING: kein Buch, kein Autor, keine Quelle, kein Kapitelverweis, kein "laut..." im Text/Titel/Summary/Tags.
- KEIN AUTOR-SELBSTBEZUG: keine Ich-Einschuebe/Selbstbekenntnisse ("Ich nehme mich da nicht aus").
- SUBJEKTIVE WERTTHEORIE wahren: nie "der Wert stammt aus/kommt von X"; immer als Vorzug gegenueber Alternativen / subjektive Abwaegung formulieren.
- BITCOIN = nuechternes Werkzeug, NIE "urspruengliche Idee/Vision/wofuer es gedacht war". Funktional formulieren.
- HALTUNG zeigen, nie etikettieren: nuechtern, gelassen, ohne Empoerung, ohne Hype.
- Wenn die Aussage polemisch ist: ihren Ton NICHT uebernehmen und NICHT gegen Kritiker oder Gegenseite zurueckkeilen.
Lies zur Sicherheit ${ROOT}/WRITING_RULES.md und ${ROOT}/WRITING_RULES.local.md selbst, bevor du urteilst/schreibst.`

const ARTICLE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'dek', 'summary', 'hashtags', 'bodyMarkdown'],
  properties: {
    title: { type: 'string', description: 'Artikeltitel ohne #, ohne Quellennamen, konkret statt Meta' },
    dek: { type: 'string', description: 'kursive Unterzeile (ein Satz). Darf leer sein.' },
    summary: { type: 'string', description: '1-2 Saetze Zusammenfassung fuer Meta' },
    hashtags: { type: 'array', items: { type: 'string' }, description: '4-6 Tags ohne #' },
    bodyMarkdown: { type: 'string', description: 'Vollstaendiger Artikel-Body: H2-Sektionen (## ...), Fliesstext, ~1100-1600 Woerter. OHNE Titelzeile, OHNE dek. Kein Gedankenstrich, keine Quellennamen.' },
  },
}

const SYNTH_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'dek', 'summary', 'hashtags', 'bodyMarkdown', 'changelog'],
  properties: {
    title: { type: 'string' },
    dek: { type: 'string' },
    summary: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
    bodyMarkdown: { type: 'string', description: 'Revidierter vollstaendiger Body, H2-Sektionen, kein Gedankenstrich, keine verbotenen Woerter.' },
    changelog: { type: 'string', description: 'Kurz: welche Team-Einwaende wie integriert wurden, welche Konflikte wie aufgeloest.' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['team', 'verdict', 'issues', 'overallNote'],
  properties: {
    team: { type: 'string' },
    verdict: { type: 'string', enum: ['ok', 'minor', 'needs_changes'] },
    issues: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['severity', 'where', 'problem', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          where: { type: 'string', description: 'woertliches Zitat / Stelle im Artikel' },
          problem: { type: 'string' },
          fix: { type: 'string', description: 'konkreter Reformulierungsvorschlag' },
        },
      },
    },
    overallNote: { type: 'string' },
  },
}

// ---------- Phase 1: Grounding + Prior-Art ----------
phase('Grounding')

const groundPrompt = (file, label) => `Du bist Grounding-Analyst (${label}). Die Datei ${file} ist ein grosses Buch-Grounding (Volltext, mehrere tausend Zeilen). Erzeuge ein FOKUSSIERTES Destillat fuer das Thema des folgenden Artikel-Anlasses.

ARTIKEL-ANLASS (Aussage/Thema, nur Anlass, NICHT zitieren):
"""${STATEMENT}"""

So gehst du vor: leite aus dem Anlass die relevanten Themen ab, nutze Grep im File nach den passenden Stichworten, lies die Fundstellen-Regionen (nicht das ganze File blind), und destilliere.

Liefere als Markdown-Text (keine Quellennamen, kein Autor, stilles Grounding):
1. Die 6-10 fuer dieses Thema tragenden Gedanken/Konzepte, jeweils 2-4 Saetze, in eigenen, neutralen Worten.
2. Wie jeder Gedanke konkret auf den Artikel-Anlass anwendbar ist.
3. Eine kurze Liste "Fallen": Formulierungen, die diesem Grounding widersprechen wuerden (z.B. objektivistische Wertbehauptungen) und die der Autor vermeiden muss.
Halte es unter ~900 Woerter. Gib NUR das Destillat zurueck (Eingabe fuer den schreibenden Agenten, keine Nachricht an einen Menschen).`

const priorArtPrompt = `Du bist Redaktions-Archivar. Im Ordner ${SESSIONS_DIR}/ liegen frueher veroeffentlichte Artikel (je eine article.md in datums-praefixierten Unterordnern wie 2026-06-15-...). Liste die Unterordner (ignoriere Nicht-Artikel-Ordner wie webp-migration) und lies die article.md jedes Artikel-Ordners. Sind es mehr als ~15, priorisiere die juengsten (nach Datums-Praefix) plus alle, deren Slug zum aktuellen Thema passt.

AKTUELLER ARTIKEL-ANLASS (damit du Themen-Naehe einschaetzt):
"""${STATEMENT}"""

Erzeuge eine "Wiederholungs-Karte" als Markdown, damit der NEUE Artikel nichts doppelt:
- Pro Artikel: 1 Satz Kernthese + die markantesten Bilder/Metaphern/Einstiege/Schluesselphrasen (woertlich, in Anfuehrungszeichen).
- Eine zusammengefasste "NICHT wiederverwenden"-Liste: konkrete Metaphern, rhetorische Muster und Einstiegs-Typen, die schon verbraucht sind.
- 3-4 frische Blickwinkel/Bilder, die fuers aktuelle Thema NOCH NICHT genutzt wurden.
Gib NUR die Karte zurueck.`

const [digKrypto, digPraxeo, priorArt] = await parallel([
  () => agent(groundPrompt(`${ROOT}/contexts/kryptooekonomie/grounding.md`, 'Kryptooekonomie'), { label: 'grounding:kryptooekonomie', phase: 'Grounding' }),
  () => agent(groundPrompt(`${ROOT}/contexts/praxeologie/grounding.md`, 'Praxeologie'), { label: 'grounding:praxeologie', phase: 'Grounding' }),
  () => agent(priorArtPrompt, { label: 'prior-art', phase: 'Grounding' }),
])

// ---------- Phase 2: Entwurf ----------
phase('Entwurf')

const writerPrompt = `Du bist der Autor. Schreibe einen eigenstaendigen, lebendigen, NUECHTERNEN deutschen Artikel zum folgenden Anlass, aus der vermischten Sicht beider Grounding-Destillate.

ARTIKEL-ANLASS (nur Anlass, NICHT zitieren, Ton NICHT uebernehmen):
"""${STATEMENT}"""

GRUNDHALTUNG:
- Ist der Anlass polemisch: wuerdige seinen wahren Kern und nimm den Fehlschluss ruhig auseinander. Uebernimm weder die Polemik noch keile gegen die Gegenseite zurueck.
- Ist es ein neutrales Thema: fuehre es nuechtern und konkret aus.
- Fuehre den Gedanken ueber das handelnde Individuum, ueber Abwaegung von Alternativen, ueber Arbeitsteilung und subjektive Wertschaetzung. Benenne Preise/Risiken ehrlich, ohne zu predigen.

${HARD}

GROUNDING-DESTILLAT A (Kryptooekonomie):
${digKrypto}

GROUNDING-DESTILLAT B (Praxeologie):
${digPraxeo}

WIEDERHOLUNGS-KARTE (NICHTS hiervon doppeln, frische Bilder waehlen):
${priorArt}

FORM:
- Konkreter Einstieg (Szene oder Zahl), keine Meta-Ankuendigung ("Dieser Artikel...").
- 3 bis 5 H2-Sektionen (## ...). ~1100-1600 Woerter.
- Burstiness: Satzlaengen stark variieren, einzelne Kurzsaetze erlaubt. Keine identisch gebauten Absatzanfaenge, keine Listen-Stakkatos.
- Schluss ruhig, ohne Appell-Pathos, ohne Selbst-Label.
Gib Titel, dek, summary, hashtags und bodyMarkdown zurueck.`

const draftV1 = await agent(writerPrompt, { label: 'writer:v1', phase: 'Entwurf', schema: ARTICLE_SCHEMA })

// ---------- Review-Teams ----------
const TEAMS = [
  {
    key: 'hoppe',
    name: 'Team Hoppe (Praxeologie)',
    lens: `Pruefe durch die praxeologische Brille (methodischer Individualismus, subjektive Werttheorie, Zeitpraeferenz, Arbeitsteilung/Spezialisierung, Handeln als Wahl unter Unsicherheit, Eigentum und Verantwortung). Finde: (a) jede objektivistische Wertbehauptung ("der Wert stammt aus X") und ersetze sie durch subjektive Abwaegung; (b) ob die Arbeitsteilungs-/Spezialisierungs-Einsicht sauber traegt; (c) ob Risiko als subjektiv gewichtet statt als objektive Tatsache erscheint; (d) jeden kollektivistischen Beiklang. Schlage geerdete Reformulierungen vor.`,
  },
  {
    key: 'kryptooekonomie',
    name: 'Team Kryptooekonomie',
    lens: `Pruefe oekonomisch-technische Praezision rund ums Thema: Vertrauensminimierung gegen Vertrauensdelegation, Gegenpartei- vs. Bedienrisiko, Markt-/Spektrum-Sichtweise statt Entweder-Oder, nuechtern statt Hype. Pruefe jede technische Tatsachenbehauptung und Zahl auf Genauigkeit und kennzeichne Schaetzungen als Schaetzungen (kein "Beweis"). Markiere jede Hype-Aussage in BEIDE Richtungen. Achte aufs stille Grounding (kein Autorname).`,
  },
  {
    key: 'gelassenheit',
    name: 'Team Gelassenheit (Ton)',
    lens: `Pruefe NUR den Ton: nuechtern, gelassen, ohne Empoerung, ohne Hype, ohne Moralisieren. Markiere jedes emotional aufgeladene Wort, jede rhetorische Eskalation, jedes "wir gegen die". Der Artikel darf eine etwaige Polemik des Anlasses NICHT uebernehmen und NICHT gegen die Gegenseite zurueckkeilen. Stelle sicher, dass kein Selbst-Label der Haltung im Text steht (insbesondere "stoisch"/"Stoizismus" duerfen NICHT vorkommen) und der Grundton ruhig-beobachtend bleibt.`,
  },
  {
    key: 'anarchisten',
    name: 'Team Anarchisten (Souveraenitaet)',
    lens: `Pruefe durch die Brille individueller Souveraenitaet / staatsfreien Geldes. Gefahr 1: Der nuechterne Ton kippt ins stille Gutheissen von Bevormundung/Delegation, ohne deren Preis (Gegenpartei-, Erlaubnis-, Beschlagnahme-Risiko, Abhaengigkeit) ehrlich zu benennen. Gefahr 2: maximalistisches Predigen als Dogma. Der ehrliche Mittelweg: Optionen mit ihrem realen Preis darstellen, weder beschaemt noch geheiligt. Markiere, wo der Artikel entweder Maximalismus predigt ODER den Souveraenitaets-Punkt stillschweigend aufgibt.`,
  },
  {
    key: 'entschaerfung',
    name: 'Team Entschaerfung (Vorwuerfe raus, nuechterner)',
    lens: `Geh Zeile fuer Zeile durch und markiere JEDE anklagende, urteilende oder geladene Formulierung, egal gegen wen. Aus einem polemischen Anlass darf KEIN Vorwurf als Vorwurf ueberleben. Die nuechterne Beobachtung dahinter darf bleiben, aber neutral umformuliert. Liefere fuer jede Fundstelle eine nuechternere Ersatzformulierung. Sei streng.`,
  },
  {
    key: 'antiwiederholung',
    name: 'Team Anti-Wiederholung',
    lens: `Vergleiche den Artikel gegen die frueheren Artikel in ${SESSIONS_DIR}/ (lies bei Bedarf article.md aus den Ordnern und nutze die Wiederholungs-Karte unten). Markiere jede wiederholte Metapher, jedes wiederholte Argument, jeden wiederverwendeten Einstiegstyp und jede gedoppelte Schluesselphrase. Schlage je einen frischen Ersatz vor.`,
  },
  {
    key: 'vermenschlichung',
    name: 'Team Vermenschlichung',
    lens: `Pruefe NUR auf maschinelle/formelhafte Sprache und Humanisierung (WRITING_RULES Abschnitt 3). Finde: gleichfoermige Satzlaengen (zu wenig Burstiness), formelhafte Uebergaenge ("Daher", "Es ist wichtig", "In einer Welt, in der", "Die Frage lautet", "Letztlich"), Tricolon-Ueberdosis, "nicht nur ... sondern auch", identisch gebaute Absatzanfaenge, Auflistungs-Stakkato, glatte aber leere KI-Formulierungen, vorhersehbare Bilder. Schlage konkretere, ueberraschendere, menschlichere Formulierungen vor (frische Bilder, variierte Satzlaengen, Einzelkurzsaetze). WICHTIG: schlage NIEMALS Ich-Einschuebe/Autor-Selbstbezuege als Loesung vor (lokale Regel verbietet sie), und keine Gedankenstriche.`,
  },
  {
    key: 'angriffsflaechen',
    name: 'Team Angriffsflaechen',
    lens: `Pruefe den Text auf Angriffsflaechen aus Unterstellungen und Tatsachenbehauptungen. Markiere: (a) jede falsifizierbare Tatsachenbehauptung, die angreifbar/unbelegt ist (Zahlen, "X ist der Beweis", Kausalbehauptungen) und die gehedged ("eine Schaetzung", "manche", "kann", "oft") oder gestrichen werden muss; (b) jede Unterstellung/Pauschalzuschreibung an eine Gruppe ("die meisten wissen nicht", "die verstehen nicht"), die als Vorwurf angreifbar ist; (c) jede objektivistische Wertbehauptung, die der Linie "keine Tatsachenbehauptungen ueber subjektiven Wert" widerspricht. Ziel: robust gegen "na ja, eigentlich ..."-Widerlegungen und gegen den Vorwurf, etwas als Fakt zu behaupten. Liefere fuer jede Stelle eine entschaerfte, belegbare oder subjektiv-formulierte Ersatzfassung.`,
  },
]

const reviewPrompt = (team, art, round, prevReviews) => `Du bist ${team.name}. Du reviewst einen Artikel-Entwurf (Runde ${round}) ausschliesslich durch deine Brille. Sei konkret, zitiere Stellen woertlich, liefere fuer jedes Problem einen umsetzbaren Fix. Erfinde keine Probleme; wenn etwas gut ist, sag verdict "ok" oder "minor".

DEINE BRILLE:
${team.lens}

${HARD}

ZU REVIEWENDER ARTIKEL:
# ${art.title}
${art.dek ? '*' + art.dek + '*\n' : ''}
${art.bodyMarkdown}

GROUNDING-DESTILLAT A (Kryptooekonomie):
${digKrypto}

GROUNDING-DESTILLAT B (Praxeologie):
${digPraxeo}

WIEDERHOLUNGS-KARTE:
${priorArt}
${prevReviews ? '\nDEINE FRUEHEREN EINWAENDE (Runde 1) zur Kontrolle, ob sie geloest wurden:\n' + prevReviews : ''}

Gib team, verdict, issues[] (severity/where/problem/fix) und overallNote zurueck.`

// ---------- Phase 3: Review-1 ----------
phase('Review-1')
const reviews1 = (await parallel(
  TEAMS.map(t => () => agent(reviewPrompt(t, draftV1, 1, null), { label: `review1:${t.key}`, phase: 'Review-1', schema: REVIEW_SCHEMA }))
)).filter(Boolean)

const reviewsToText = (revs) => revs.map(r =>
  `### ${r.team} [${r.verdict}]\n${r.overallNote}\n` +
  r.issues.map(i => `- (${i.severity}) bei "${i.where}": ${i.problem}\n  FIX: ${i.fix}`).join('\n')
).join('\n\n')

// ---------- Phase 4: Synthese v2 ----------
phase('Synthese')
const synthPrompt = `Du bist der Chefredakteur. Integriere die Einwaende von acht Review-Teams in eine ueberarbeitete Fassung des Artikels. Loese Konflikte zwischen Teams bewusst auf (z.B. Souveraenitaet ehrlich benennen UND nicht predigen: nenne Preise/Risiken nuechtern als Tatsache, ohne Appell). Behalte das Gute, kuerze Schwaches, halte den nuechternen Grundton und die Burstiness. Erfinde keine neuen Verstoesse.

${HARD}

URSPRUNGS-ARTIKEL:
# ${draftV1.title}
${draftV1.dek ? '*' + draftV1.dek + '*\n' : ''}
${draftV1.bodyMarkdown}

TEAM-EINWAENDE (Runde 1):
${reviewsToText(reviews1)}

Gib die revidierte Fassung zurueck (title, dek, summary, hashtags, bodyMarkdown) plus changelog.`

const v2 = await agent(synthPrompt, { label: 'synthese:v2', phase: 'Synthese', schema: SYNTH_SCHEMA })

// ---------- Phase 5: Review-2 (adversarisch / Verifikation) ----------
phase('Review-2')
const reviews2 = (await parallel(
  TEAMS.map(t => {
    const prev = reviews1.find(r => r.team === t.name)
    const prevTxt = prev ? prev.issues.map(i => `- ${i.problem} (FIX war: ${i.fix})`).join('\n') : null
    return () => agent(reviewPrompt(t, v2, 2, prevTxt), { label: `review2:${t.key}`, phase: 'Review-2', schema: REVIEW_SCHEMA })
  })
)).filter(Boolean)

// ---------- Phase 6: Finale v3 + Gate-Selbstpruefung ----------
phase('Finale')
const remaining = reviews2.filter(r => r.verdict !== 'ok')
const finalPrompt = `Du bist der Chefredakteur. Dies ist die letzte Runde. Arbeite die verbliebenen Team-Einwaende aus Runde 2 ein und liefere die FINALE Fassung. Fuehre danach eine SELBST-GATE-PRUEFUNG durch und stelle sicher:
- KEIN Halbgeviert- und KEIN Geviert-Gedankenstrich im Text (auch nicht als Einschub mit Leerzeichen). Pruefe jeden Satz.
- KEINE verbotenen Woerter: horten/Hortung/Hort, Gemeinwohl, stoisch/Stoizismus, Voskuil, Etatismus, Hearn-Fehler.
- Kein Quellen-/Autor-/Buchverweis, kein Autor-Selbstbezug, keine objektivistische Wertbehauptung.
- Nuechtern, keine uebernommene Polemik, kein Appell-Pathos.
Wenn die Pruefung etwas findet, korrigiere es still in der finalen Fassung.

${HARD}

AKTUELLE FASSUNG (v2):
# ${v2.title}
${v2.dek ? '*' + v2.dek + '*\n' : ''}
${v2.bodyMarkdown}

VERBLIEBENE EINWAENDE (Runde 2, nur nicht-ok):
${remaining.length ? reviewsToText(remaining) : 'Keine wesentlichen Einwaende mehr. Nur Feinschliff + Gate-Pruefung.'}

Gib die finale Fassung zurueck (title, dek, summary, hashtags, bodyMarkdown) plus changelog (was in dieser Runde geaendert wurde + Ergebnis der Gate-Selbstpruefung).`

const v3 = await agent(finalPrompt, { label: 'synthese:v3', phase: 'Finale', schema: SYNTH_SCHEMA })

log(`Fertig. Review-1: ${reviews1.map(r => r.verdict).join(', ')}. Review-2: ${reviews2.map(r => r.verdict).join(', ')}.`)

return { article: v3, round1: reviews1, round2: reviews2 }
