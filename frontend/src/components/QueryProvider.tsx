// React Query client configuration with AGGRESSIVE error handling to stop API bombardment
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState, ReactNode } from 'react'

interface QueryProviderProps {
  children: ReactNode
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(() => 
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 10 * 60 * 1000, // 10 minutes - very long stale time
          gcTime: 15 * 60 * 1000, // 15 minutes cache time
          retry: false, // COMPLETELY DISABLE ALL RETRIES
          refetchInterval: false, // DISABLE ALL AUTOMATIC REFETCHING
          refetchOnWindowFocus: false, // DISABLE REFETCH ON FOCUS
          refetchOnReconnect: false, // DISABLE REFETCH ON RECONNECT
          refetchOnMount: false, // DISABLE REFETCH ON MOUNT IF DATA EXISTS
          // Only fetch data once and cache it
          networkMode: 'online', // Only run queries when online
        },
        mutations: {
          retry: false, // DISABLE ALL MUTATION RETRIES
          networkMode: 'online',
        },
      },
    })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
