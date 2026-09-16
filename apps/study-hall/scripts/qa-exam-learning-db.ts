// Run against the local Docker database only. All generated rows are removed in finally.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readLearningDocument, updateLearningDocument } from '../lib/exam-preview/learning-store';
import { loadAnalysisSource, loadLegacyAnalysisScores } from '../lib/exam-preview/source';
import { conflict } from '../lib/errors';

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Local database required');
  assert.notEqual(process.env.MOCK_MODE, 'true');
  const { prisma } = await import('../lib/prisma');
  const ids = [randomUUID(), randomUUID()];
  const created: string[] = [];
  try {
    for (const id of ids) {
      await prisma.division.create({ data: { id, slug: `qa-learning-${id}`, name: '로컬 검증', fullName: '로컬 검증', color: '#123456' } });
      created.push(id);
      assert.equal((await readLearningDocument(id)).revision, 0);
      assert.equal((await loadAnalysisSource(`qa-learning-${id}`)).divisionId, id);
      assert.deepEqual(await loadLegacyAnalysisScores(`qa-learning-${id}`, id), {regular:[],morning:[]});
    }
    // Independent connections compete for the same initial revision, including first-row creation.
    const outcomes = await Promise.allSettled(Array.from({length:3}, () => updateLearningDocument(ids[0], doc => {
      if (doc.revision !== 0) throw conflict('stale');
      return {...doc, revision:1, subjects:[{id:'sample', name:'보존 확인', subjectIds:[]}]};
    })));
    assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(o => o.status === 'rejected').length, 2);
    for (const outcome of outcomes) if (outcome.status === 'rejected') assert.equal(outcome.reason.status, 409);
    assert.equal((await readLearningDocument(ids[0])).revision, 1);
    assert.equal((await readLearningDocument(ids[1])).revision, 0);
    await assert.rejects(updateLearningDocument(ids[0], doc => ({...doc, divisionId:ids[1]})));
    await assert.rejects(updateLearningDocument(ids[0], () => { throw Error('rollback'); }));
    assert.equal((await readLearningDocument(ids[0])).revision, 1);
    assert.equal((await readLearningDocument(ids[0])).subjects[0].name, '보존 확인');
    console.log('PASS: DB loader, persisted reload, cross-academy isolation, concurrent first-save conflict, owner constraint and transaction rollback');
  } finally {
    await prisma.examLearningDocument.deleteMany({where:{divisionId:{in:created}}});
    await prisma.division.deleteMany({where:{id:{in:created}}});
    await prisma.$disconnect();
  }
}
void main();
