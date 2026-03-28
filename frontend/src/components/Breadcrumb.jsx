import { Link } from 'react-router-dom'

/**
 * Breadcrumb component
 * Usage:
 *   <Breadcrumb items={[
 *     { label: 'LP Firms', to: '/firms' },
 *     { label: 'Acme Capital' },   // no `to` = current page (not linked)
 *   ]} />
 */
export default function Breadcrumb({ items = [] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-qgray-500 mb-4 flex-wrap">
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-qgray-300 select-none">/</span>
            )}
            {item.to && !isLast ? (
              <Link
                to={item.to}
                className="hover:text-qgreen-700 transition-colors font-medium"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-qgray-800 font-semibold' : 'font-medium'}>
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
