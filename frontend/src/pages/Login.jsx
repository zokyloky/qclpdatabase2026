import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, isLoggedIn } from '../api'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const navigate                = useNavigate()

  if (isLoggedIn()) {
    navigate('/firms', { replace: true })
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(password)
      navigate('/firms', { replace: true })
    } catch (err) {
      setError('Incorrect password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-qnavy-800">
      <div className="w-full max-w-sm px-4">

        {/* Brand mark */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-qteal-600 mb-4 shadow-lg">
            <span className="text-white font-bold text-2xl leading-none">Q</span>
          </div>
          <h1 className="text-xl font-semibold text-white tracking-wide">LP Intelligence</h1>
          <p className="text-qnavy-300 text-sm mt-1 tracking-widest font-medium uppercase text-xs">Quadria Capital</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-qgray-700 mb-1.5">
                Access password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
                placeholder="Enter password"
                required
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="btn-primary w-full py-2.5"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-xs text-qgray-400 mt-6">
            Internal use only &mdash; Quadria Capital
          </p>
        </div>
      </div>
    </div>
  )
}
