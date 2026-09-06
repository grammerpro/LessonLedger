import { db, id, now, encode } from './db';
import { hash } from './parse';
import { sampleCompare, sampleRules, fingerprint } from './evidence';
import { config } from './config';

export async function createSample() {
  if (!config.demo) throw new Error('Sample workspaces are disabled');
  const workspace = id();
  const course = id();
  const date = now();
  const check = id();
  await db.transaction(async (trx) => {
    await trx('workspaces').insert({
      id: workspace,
      name: 'The thoughtful creator',
      demo: true,
      created_at: date,
      touched_at: date,
      payload: encode({ notifications: false, retentionDays: 30, timezone: 'America/New_York' }),
    });
    await trx('courses').insert({
      id: course,
      workspace_id: workspace,
      created_at: date,
      payload: encode({
        title: 'Build your second brain',
        product: 'Folio',
        description: 'A practical, calmer approach to organizing your digital life.',
        color: 'sage',
      }),
    });
    const source = id();
    const snapshot = id();
    const sourceText =
      sampleRules.map((r) => r.evidence).join('\n\n') +
      '\n\nCreate a new page with the New page button. Use a heading to organize sections. Drag a page into another page to nest it. Add a checkbox with the /todo command.';
    await trx('sources').insert({
      id: source,
      workspace_id: workspace,
      course_id: course,
      created_at: date,
      payload: encode({
        title: 'Folio product updates',
        url: 'https://folio.example/updates',
        text: sourceText,
        provenance: 'fictional sample',
        validated: true,
      }),
    });
    await trx('source_snapshots').insert({
      id: snapshot,
      workspace_id: workspace,
      source_id: source,
      created_at: date,
      payload: encode({
        text: sourceText,
        hash: hash(sourceText),
        url: 'https://folio.example/updates',
        provenance: 'fictional sample',
      }),
    });
    const lessons = [
      [
        'Welcome to a more organized day',
        'Create a new page with the New page button. Use a heading to organize sections.',
        'Line 1',
      ],
      [
        'Publish a page with confidence',
        'Your workspace is ready to share.\n\nOpen the Share menu and select Publish to web.\n\nCopy the public link and send it to your learners.',
        '00:02:14.000 → 00:02:28.000',
      ],
      [
        'Let your database do the work',
        'Automations are available on every plan, including Free.\n\nCreate an automation that updates the status of a new entry.',
        'Line 8',
      ],
      [
        'A home for your next great idea',
        'Use the Quick Capture template to save a new idea.\n\nGive each idea a descriptive title so you can find it later.',
        'Page 3',
      ],
      ['Create a little structure', 'Drag a page into another page to nest it.', 'Line 1'],
      ['Make room for what matters', 'Add a checkbox with the /todo command.', 'Line 1'],
    ];
    await trx('check_runs').insert({
      id: check,
      workspace_id: workspace,
      course_id: course,
      status: 'completed',
      available_at: date,
      created_at: date,
      payload: encode({
        progress: 6,
        total: 6,
        covered: 6,
        inconclusive: 0,
        findings: 3,
        completedAt: date,
        warnings: [],
        sample: true,
      }),
    });
    for (const [title, text, location] of lessons) {
      const lesson = id();
      const version = id();
      const segments = [{ location, text }];
      await trx('lessons').insert({
        id: lesson,
        workspace_id: workspace,
        course_id: course,
        created_at: date,
        payload: encode({
          title,
          versionId: version,
          format: location.startsWith('Page') ? 'pdf' : location.startsWith('00') ? 'vtt' : 'md',
        }),
      });
      await trx('lesson_versions').insert({
        id: version,
        workspace_id: workspace,
        lesson_id: lesson,
        created_at: date,
        payload: encode({ segments, hash: hash(text), number: 1 }),
      });
      await trx('check_items').insert({
        id: id(),
        workspace_id: workspace,
        check_id: check,
        version_id: version,
        created_at: date,
        payload: encode({ covered: true, sample: true }),
      });
      for (const candidate of sampleCompare(segments, sourceText))
        await trx('findings').insert({
          id: id(),
          workspace_id: workspace,
          check_id: check,
          version_id: version,
          snapshot_id: snapshot,
          fingerprint: fingerprint(lesson, candidate, source),
          status: 'open',
          created_at: date,
          payload: encode({
            ...candidate,
            lessonTitle: title,
            courseId: course,
            sourceUrl: 'https://folio.example/updates',
            sourceTitle: 'Folio product updates',
            capturedAt: date,
            provenance: 'fictional sample',
          }),
        });
    }
  });
  return workspace;
}
