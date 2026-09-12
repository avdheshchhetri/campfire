import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareLeaderboard, memberInitials } from './leaderboardModel.js';

const rows = [
  { user_id: '3', display_name: 'Zoe', verified_count: '3', total_topics: '4' },
  { user_id: '1', display_name: 'Alex', verified_count: 4, total_topics: 4 },
  { user_id: '2', display_name: 'Bea', verified_count: 4, total_topics: 4 },
];

test('orders numeric scores descending with stable names and competition ties', () => {
  const result = prepareLeaderboard(rows);
  assert.deepEqual(result.map((row) => [row.display_name, row.rank, row.progress]), [
    ['Alex', 1, 100], ['Bea', 1, 100], ['Zoe', 3, 75],
  ]);
  assert.equal(rows[0].rank, undefined, 'does not mutate query data');
});

test('name sorting retains score-based ranks', () => {
  assert.deepEqual(prepareLeaderboard(rows, 'name-desc').map((row) => [row.display_name, row.rank]), [
    ['Zoe', 3], ['Bea', 1], ['Alex', 1],
  ]);
});

test('handles the zero-topic room fallback without division by zero', () => {
  const [member] = prepareLeaderboard([{ user_id: '1', display_name: 'Alex', verified_count: 0, total_topics: 0 }]);
  assert.equal(member.progress, 0);
  assert.equal(member.rank, 1);
  assert.deepEqual(prepareLeaderboard([]), []);
});

test('keeps progress accessible when a count is missing or inconsistent', () => {
  const result = prepareLeaderboard([
    { user_id: '1', display_name: 'Alex', verified_count: 10, total_topics: 2 },
    { user_id: '2', display_name: 'Bea', verified_count: null, total_topics: null },
  ]);
  assert.equal(result[0].progress, 100);
  assert.equal(result[1].progress, 0);
});

test('initials handle names with surrounding or repeated whitespace', () => {
  assert.equal(memberInitials('  Alex   Rivera '), 'AR');
  assert.equal(memberInitials(''), '?');
});
