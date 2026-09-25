// Single source of truth for the judging rubric.
//
// Extracted from src/views/CriteriaView.vue so the public criteria page,
// the judges panel, and the scoring form all read the exact same list.
// Weight is informational (the public page renders "20%"); `max` is the
// per-criterion score ceiling used by scoring — 5 × 10 = /50, and
// total/50 × 100 reproduces the equal 5 × 20% weighting directly.

export const CRITERIA = [
  {
    key: 'functional',
    title: 'Functional Execution & User Experience',
    weight: '20%',
    max: 10,
    description: 'Live feature testing and reliability. Does it really work and is it easy to use?',
  },
  {
    key: 'design',
    title: 'UI, Design & Frontend Presentation',
    weight: '20%',
    max: 10,
    description: 'Visual quality, modern design, and responsiveness.',
  },
  {
    key: 'code',
    title: 'Code Quality & Architecture',
    weight: '20%',
    max: 10,
    description: 'Clean structure, backend logic, scalability, and secure data management.',
  },
  {
    key: 'docs',
    title: 'Documentation & Video Demonstration',
    weight: '20%',
    max: 10,
    description:
      'Documentation clarity, setup guides, and project demo (min 1 minute video required).',
  },
  {
    key: 'github',
    title: 'GitHub & Version Control',
    weight: '20%',
    max: 10,
    description:
      'Meaningful commits, branches, PRs, hygiene. Primary tie-breaker. Code freeze Sep 23, 12MN.',
  },
]

// Sum of every criterion's `max` — the denominator for a judge's total.
export const TOTAL_MAX = CRITERIA.reduce((sum, c) => sum + c.max, 0)

export const RULES = [
  'Maximum 5 students per team',
  'Original work created during the hacking window',
  'Maintain academic integrity at all times',
  'Respect participants, organizers, and judges',
  'NEVER PUSH .env / API keys / passwords / tokens — one leak can disqualify',
  'Video demonstration required (at least 1 minute)',
]
