import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { logout } from '../api'

const navItems = [
  { to: '/firms',    label: 'LP Firms',          icon: '🏢' },
  { to: '/review',   label: 'Review Queue',      icon: '📋' },
  { to: '/selected', label: 'Selected Contacts', icon: '✅' },
  { to: '/sync',     label: 'Sync',              icon: '🔄' },
]

export default function Layout() {
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="font-semibold text-gray-900 text-sm tracking-wide">
              LP Intelligence
            </span>
            <nav className="flex items-center gap-1">
              {navItems.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ` +
                    (isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')
                  }
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}
