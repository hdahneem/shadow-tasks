import { describe, it, expect } from 'vitest';
import { parseHierarchicalCsv, HIERARCHICAL_CSV_TEMPLATE } from './hierarchicalCsvImport';

const HEADER = 'Project,List,Quest,Task,Priority,Due Date,Description';

describe('parseHierarchicalCsv', () => {
  it('parses a single quest with a subtask', () => {
    const csv = [
      HEADER,
      'Clear the Red Gate,Prep,Scout the entrance,,high,2026-08-10,Recon first',
      ',,,Check gate stability,medium,,',
    ].join('\n');

    const { groups, skips } = parseHierarchicalCsv(csv);

    expect(skips).toEqual([]);
    expect(groups).toEqual([
      {
        projectName: 'Clear the Red Gate',
        listName: 'Prep',
        quests: [
          {
            title: 'Scout the entrance',
            priority: 'high',
            dueDate: new Date('2026-08-10').toISOString(),
            description: 'Recon first',
            subtasks: [{ title: 'Check gate stability', priority: 'medium' }],
          },
        ],
      },
    ]);
  });

  it('fills down Project/List/Quest across blank cells', () => {
    const csv = [
      HEADER,
      'Clear the Red Gate,Prep,Scout the entrance,,,,',
      ',,,Check gate stability,,,',
      ',,,Brief the party,,,',
      ',,Gather potions,,,,',
    ].join('\n');

    const { groups } = parseHierarchicalCsv(csv);

    expect(groups).toHaveLength(1);
    expect(groups[0].projectName).toBe('Clear the Red Gate');
    expect(groups[0].listName).toBe('Prep');
    expect(groups[0].quests).toHaveLength(2);
    expect(groups[0].quests[0].title).toBe('Scout the entrance');
    expect(groups[0].quests[0].subtasks.map((s) => s.title)).toEqual(['Check gate stability', 'Brief the party']);
    expect(groups[0].quests[1].title).toBe('Gather potions');
    expect(groups[0].quests[1].subtasks).toEqual([]);
  });

  it('starts a new group for a different Project or List, then reopens the same pair as a fresh group when it reappears non-contiguously', () => {
    const csv = [
      HEADER,
      'Project A,List X,Quest 1,,,,',
      'Project A,List Y,Quest 2,,,,',
      'Project A,List X,Quest 3,,,,',
    ].join('\n');

    const { groups } = parseHierarchicalCsv(csv);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ projectName: 'Project A', listName: 'List X' });
    expect(groups[1]).toMatchObject({ projectName: 'Project A', listName: 'List Y' });
    expect(groups[2]).toMatchObject({ projectName: 'Project A', listName: 'List X' });
    expect(groups[0].quests[0].title).toBe('Quest 1');
    expect(groups[2].quests[0].title).toBe('Quest 3');
  });

  it('looks up headers case-insensitively and in any order', () => {
    const csv = ['TASK,QUEST,list,PROJECT', ',Do the thing,General,My Project'].join('\n');
    const { groups } = parseHierarchicalCsv(csv);
    expect(groups[0]).toMatchObject({ projectName: 'My Project', listName: 'General' });
    expect(groups[0].quests[0].title).toBe('Do the thing');
  });

  it('skips a Task row with no Quest defined yet in the current Project/List, with the correct row number', () => {
    const csv = [HEADER, 'My Project,General,,Orphan subtask,,,'].join('\n');
    const { groups, skips } = parseHierarchicalCsv(csv);
    expect(groups).toEqual([]);
    expect(skips).toEqual([{ rowNumber: 2, reason: 'no Quest defined yet for this Project/List' }]);
  });

  it('skips a Task row when the Project/List changed since the last Quest, even though a quest exists elsewhere', () => {
    const csv = [
      HEADER,
      'Project A,List X,Quest 1,,,,',
      'Project B,List Y,,Orphan under a different project,,,',
    ].join('\n');
    const { groups, skips } = parseHierarchicalCsv(csv);
    expect(groups).toHaveLength(1);
    expect(groups[0].quests[0].subtasks).toEqual([]);
    expect(skips).toEqual([{ rowNumber: 3, reason: 'no Quest defined yet for this Project/List' }]);
  });

  it('treats blank-title Quest/Task rows as no-ops, not skips, while still updating fill-down state', () => {
    const csv = [HEADER, 'My Project,General,,,,,', ',,Real quest,,,,'].join('\n');
    const { groups, skips } = parseHierarchicalCsv(csv);
    expect(skips).toEqual([]);
    expect(groups[0].quests[0].title).toBe('Real quest');
  });

  it('treats a row with both Quest and Task filled as a Quest row, ignoring Task', () => {
    const csv = [HEADER, 'My Project,General,The quest,ignored task text,,,'].join('\n');
    const { groups } = parseHierarchicalCsv(csv);
    expect(groups[0].quests).toHaveLength(1);
    expect(groups[0].quests[0].title).toBe('The quest');
    expect(groups[0].quests[0].subtasks).toEqual([]);
  });

  it('drops an unrecognized Priority value but still creates the row', () => {
    const csv = [HEADER, 'My Project,General,A quest,,urgent,,'].join('\n');
    const { groups } = parseHierarchicalCsv(csv);
    expect(groups[0].quests[0]).not.toHaveProperty('priority');
    expect(groups[0].quests[0].title).toBe('A quest');
  });

  it('drops an unparseable Due Date value but still creates the row', () => {
    const csv = [HEADER, 'My Project,General,A quest,,,not-a-date,'].join('\n');
    const { groups } = parseHierarchicalCsv(csv);
    expect(groups[0].quests[0]).not.toHaveProperty('dueDate');
  });

  it('throws when Project or List columns are missing', () => {
    expect(() => parseHierarchicalCsv('Quest,Task\nDo it,')).toThrow(/Project.*List/);
  });

  it('throws when neither Quest nor Task column is present', () => {
    expect(() => parseHierarchicalCsv('Project,List\nA,B')).toThrow(/Quest.*Task/);
  });

  it('returns an empty result for empty input', () => {
    expect(parseHierarchicalCsv('')).toEqual({ groups: [], skips: [] });
  });

  it('the shipped template round-trips through the parser without throwing and produces the expected shape', () => {
    const { groups, skips } = parseHierarchicalCsv(HIERARCHICAL_CSV_TEMPLATE);
    expect(skips).toEqual([]);
    expect(groups).toHaveLength(1);
    expect(groups[0].quests).toHaveLength(2);
    expect(groups[0].quests[0].subtasks).toHaveLength(2);
  });
});
