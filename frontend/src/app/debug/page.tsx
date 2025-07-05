// Simple test page to debug backend session creation issue
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getErrorMessage } from '@/lib/utils'

export default function DebugPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const testSessionCreation = async () => {
    setLoading(true)
    setResult(null)
    
    try {
      // Test session creation
      const createResponse = await fetch('http://localhost:8000/api/v1/sessions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language_a: 'en',
          language_b: 'es'
        })
      })
      
      const createData = await createResponse.json()
      console.log('Create response:', createData)
      
      if (createResponse.ok && createData.session_id) {
        // Test fetching the created session
        const fetchResponse = await fetch(`http://localhost:8000/api/v1/sessions/${createData.session_id}`)
        const fetchData = await fetchResponse.json()
        
        setResult({
          create: {
            status: createResponse.status,
            data: createData
          },
          fetch: {
            status: fetchResponse.status,
            data: fetchData
          }
        })
      } else {
        setResult({
          create: {
            status: createResponse.status,
            data: createData
          },
          error: 'Session creation failed'
        })
      }
    } catch (error) {
      setResult({
        error: getErrorMessage(error)
      })
    }
    
    setLoading(false)
  }

  const testBackendHealth = async () => {
    setLoading(true)
    setResult(null)
    
    try {
      const response = await fetch('http://localhost:8000/health')
      const data = await response.json()
      
      setResult({
        health: {
          status: response.status,
          data: data
        }
      })
    } catch (error) {
      setResult({
        error: getErrorMessage(error)
      })
    }
    
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Backend Debug Tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex space-x-4">
              <Button onClick={testBackendHealth} disabled={loading}>
                Test Backend Health
              </Button>
              <Button onClick={testSessionCreation} disabled={loading}>
                Test Session Creation
              </Button>
            </div>
            
            {loading && (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2">Testing...</p>
              </div>
            )}
            
            {result && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-2">Results:</h3>
                <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-sm">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Current Issue Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p><strong>Session ID:</strong> 38215ec1-9283-4e06-b450-46f356816c5e</p>
              <p><strong>Issue:</strong> Session created but returns 404 when fetched</p>
              <p><strong>URLs Failing:</strong></p>
              <ul className="list-disc ml-6 space-y-1">
                <li>GET /api/v1/sessions/38215ec1-9283-4e06-b450-46f356816c5e</li>
                <li>GET /api/v1/sessions/38215ec1-9283-4e06-b450-46f356816c5e/tokens</li>
              </ul>
              <p><strong>Possible Causes:</strong></p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Database transaction not committed</li>
                <li>Session creation endpoint not actually creating sessions</li>
                <li>Authentication middleware blocking requests</li>
                <li>Session ID format mismatch</li>
                <li>Database connection issues</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
