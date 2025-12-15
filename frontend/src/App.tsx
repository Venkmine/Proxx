import { useState } from 'react'

const BACKEND_URL = 'http://127.0.0.1:8000'

function App() {
  const [healthStatus, setHealthStatus] = useState<string>('')

  const checkBackendHealth = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/health`)
      const data = await response.json()
      setHealthStatus(`Backend status: ${data.status}`)
    } catch (error) {
      setHealthStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Proxx — scaffolding phase</h1>
      <button 
        onClick={checkBackendHealth}
        style={{
          padding: '0.5rem 1rem',
          fontSize: '1rem',
          cursor: 'pointer',
          marginTop: '1rem'
        }}
      >
        Check backend health
      </button>
      {healthStatus && (
        <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>
          {healthStatus}
        </p>
      )}
    </div>
  )
}

export default App
