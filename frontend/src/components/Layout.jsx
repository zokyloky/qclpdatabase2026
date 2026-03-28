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
      <header className="bg-qnavy-800 sticky top-0 z-40">
        <div className="w-full px-6 h-14 flex items-center justify-between">

          {/* Brand + nav */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="w-7 h-7 rounded bg-qteal-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm leading-none select-none">Q</span>
              </div>
              <div className="leading-tight">
                <div className="text-white font-semibold text-sm tracking-wide">LP Intelligence</div>
                <div className="text-qnavy-300 text-2xs tracking-widest font-medium">QUADRIA CAPITAL</div>
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
                      ? 'bg-white/15 text-white'
                      : 'text-qnavy-200 hover:bg-white/10 hover:text-white')
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
            className="text-sm text-qnavy-200 hover:text-white transition-colors px-3 py-1.5 rounded hover:bg-white/10"
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
