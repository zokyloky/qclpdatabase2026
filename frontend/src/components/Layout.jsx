import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { logout } from '../api'

const navItems = [
  { to: '/firms',    label: 'LP Firms'          },
  { to: '/review',   label: 'Review Queue'      },
  { to: '/selected', label: 'Selected Contacts' },
  { to: '/sync',     label: 'Sync'              },
]

export default function Layout() {
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col bg-qgray-100">

      {/* ── Top navigation ── */}
      <header className="bg-qgreen-800 sticky top-0 z-40 shadow-nav">
        <div className="w-full px-6 h-14 flex items-center justify-between">

          {/* Brand + nav */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 flex-shrink-0">
              <img
                src="/quadria_Logo.jpg"
                alt="Quadria Capital"
                className="w-9 h-9 rounded-md flex-shrink-0"
              />
              <div className="leading-tight">
                <div className="text-white font-display font-bold text-sm tracking-tight">Quadria Capital</div>
                <div className="text-green-200 text-2xs tracking-widest font-semibold uppercase">Internal LP Database</div>
              </div>
            </div>

            <nav className="flex items-center gap-0.5">
              {navItems.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `px-3.5 py-1.5 rounded text-sm font-medium transition-all duration-150 ` +
                    (isActive
                      ? 'bg-white/20 text-white shadow-sm'
                      : 'text-green-100 hover:bg-white/10 hover:text-white')
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Sign out */}
          <button
            onClick={handleLogout}
            className="text-sm text-green-100 hover:text-white transition-colors px-3 py-1.5 rounded hover:bg-white/10"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Page content — full width ── */}
      <main className="flex-1 w-full px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}
