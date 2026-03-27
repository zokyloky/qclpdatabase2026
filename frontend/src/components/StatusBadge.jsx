const BADGE_CONFIG = {
  no_contacts:  { label: 'No contacts',  bg: 'bg-gray-100',   text: 'text-gray-600'  },
  needs_review: { label: 'Needs review', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  ready:        { label: 'Ready',        bg: 'bg-blue-100',   text: 'text-blue-700'  },
  active:       { label: 'Active',       bg: 'bg-green-100',  text: 'text-green-700' },
  overdue:      { label: 'Overdue',      bg: 'bg-red-100',    text: 'text-red-700'   },
}

export default function StatusBadge({ badge }) {
  const cfg = BADGE_CONFIG[badge] || BADGE_CONFIG.no_contacts
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}
