const timestamp = value => Date.parse(value && !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? `${value}Z` : value);

export function buildSessionRecap(topics, session, examDate) {
  const verified = topics.filter(topic => topic.status === 'verified');
  const remaining = topics.filter(topic => topic.status !== 'verified');
  const start = timestamp(session.started_at), end = timestamp(session.ended_at);
  const covered = topics.filter(topic => {
    const time = timestamp(topic.last_taught_at);
    return Number.isFinite(start) && Number.isFinite(end) && time >= start && time <= end;
  });
  const ratio = topics.length ? verified.length / topics.length : 0;
  // Calendar dates use local midnight rather than UTC to avoid a one-day shift.
  const exam = examDate ? Date.parse(`${examDate}T23:59:59`) : NaN;
  const close = Number.isFinite(exam) && Number.isFinite(end) && exam >= end && exam - end <= 7 * 86400000;
  const mood = ratio > 0.5 ? 'encouraging' : close && ratio < 0.5 ? 'concerned' : 'neutral';
  const names = items => items.slice(0, 2).map(item => item.title.slice(0, 100)).join(' and ');
  if (!topics.length) return { mood, text: 'Your session is complete—add syllabus topics to track what you learn next.' };
  const progress = covered.length ? `you worked on ${names(covered)} this session` : `${verified.length} of ${topics.length} topics are verified so far`;
  const next = remaining.length ? `${names(remaining)} still ${remaining.length === 1 ? 'needs' : 'need'} work${close ? ' before your upcoming exam' : ''}` : 'every syllabus topic is now verified';
  return { mood, text: `${mood === 'encouraging' ? 'Nice work' : mood === 'concerned' ? 'Keep going' : 'Session complete'}—${progress}, and ${next}.` };
}
