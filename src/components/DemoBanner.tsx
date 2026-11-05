import { resetDemo } from '../demo/client'
import { DEMO_PIN } from '../demo/fixtures'
import { store } from '../lib/store'

export const REPO_URL = 'https://github.com/Felix-Kasper/jarvis-command-center'

/** Thin bar shown only in the public demo: what you are looking at, the demo PIN, and a reset. */
export function DemoBanner() {
  return (
    <div className="demo-bar" role="note">
      <span className="demo-dot" aria-hidden="true" />
      <span>
        <strong>Live demo</strong>
        <span className="demo-long"> · fictional data, nothing leaves your browser</span> · PIN <code>{DEMO_PIN}</code>
      </span>
      <span className="demo-actions">
        <button
          type="button"
          onClick={() => {
            resetDemo()
            store.clearLocal()
            try {
              sessionStorage.clear()
            } catch {
              /* ignore */
            }
            location.reload()
          }}
        >
          Reset
        </button>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          Code
        </a>
      </span>
    </div>
  )
}
