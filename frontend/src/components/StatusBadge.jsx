const BADGE_CONFIG = {
  needs_attention: {
    label: 'Needs Attention',
    className: 'bg-amber-50 text-amber-800 border border-amber-200',
  },
  unreviewed: {
    label: 'Unreviewed',
    className: 'bg-qgray-100 text-qgray-600 border border-qgray-300',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-qgreen-50 text-qgreen-700 border border-qgreen-200',
  },
  complete: {
    label: 'Complete',
    className: 'bg-qteal-50 text-qteal-700 border border-qteal-200',
  },
  no_contacts: {
    label: 'No Contacts',
    className: 'bg-qgray-50 text-qgray-400 border border-qgray-200',
  },
}

export default function StatusBadge({ status }) {
  const cfg = BADGE_CONFIG[status] || BADGE_CONFIG.unreviewed
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
