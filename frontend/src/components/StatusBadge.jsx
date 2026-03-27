const BADGE_CONFIG = {
  needs_attention: { label: 'Needs Attention', bg: 'bg-amber-100',  text: 'text-amber-800'  },
  unreviewed:      { label: 'Unreviewed',      bg: 'bg-gray-100',   text: 'text-gray-600'   },
  in_progress:     { label: 'In Progress',     bg: 'bg-blue-100',   text: 'text-blue-700'   },
  complete:        { label: 'Complete',        bg: 'bg-green-100',  text: 'text-green-700'  },
  no_contacts:     { label: 'No Contacts',     bg: 'bg-gray-50',    text: 'text-gray-400'   },
}

export default function StatusBadge({ status }) {
  const cfg = BADGE_CONFIG[status] || BADGE_CONFIG.unreviewed
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}
