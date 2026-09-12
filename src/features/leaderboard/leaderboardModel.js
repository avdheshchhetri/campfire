const count = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
};

const byName = (left, right) =>
  left.display_name.localeCompare(right.display_name, undefined, { sensitivity: 'base' }) ||
  left.user_id.localeCompare(right.user_id);

// Rank by score before applying the chosen display order, so alphabetical
// sorting never changes a member's rank. Equal scores use competition ranks.
export function prepareLeaderboard(rows, sort = 'progress') {
  const ranked = rows.map((row) => {
    const totalTopics = count(row.total_topics);
    const verifiedCount = count(row.verified_count);
    return {
      ...row,
      total_topics: totalTopics,
      verified_count: verifiedCount,
      progress: totalTopics > 0 ? Math.min(100, (verifiedCount / totalTopics) * 100) : 0,
    };
  }).sort((left, right) => right.verified_count - left.verified_count || byName(left, right));

  let rank = 0;
  let previousScore;
  ranked.forEach((row, index) => {
    if (row.verified_count !== previousScore) rank = index + 1;
    row.rank = rank;
    previousScore = row.verified_count;
  });

  if (sort === 'name-asc') ranked.sort(byName);
  if (sort === 'name-desc') ranked.sort((left, right) => byName(right, left));
  return ranked;
}

export function memberInitials(name) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}
