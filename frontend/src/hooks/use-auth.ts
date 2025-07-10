import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { STORAGE_KEYS, ROUTES } from '@/lib/constants'
import type { LoginRequest, RegisterRequest } from '@/types'

export function useLogin() {
  const router = useRouter()
  const setAuth = useAuthStore((state) => state.setAuth)
  const setLoading = useAuthStore((state) => state.setLoading)

  return useMutation({
    mutationFn: authApi.login,
    onMutate: () => {
      setLoading(true)
    },
    onSuccess: (data) => {
      // Update auth store (which will handle localStorage)
      setAuth(data.user, data.tokens)
      
      toast.success('Welcome back!')
      router.push(ROUTES.DASHBOARD)
    },
    onError: (error: any) => {
      console.error('Login error:', error)
      const message = error.response?.data?.detail || 'Login failed'
      toast.error(message)
    },
    onSettled: () => {
      setLoading(false)
    },
  })
}

export function useRegister() {
  const router = useRouter()
  const setAuth = useAuthStore((state) => state.setAuth)
  const setLoading = useAuthStore((state) => state.setLoading)

  return useMutation({
    mutationFn: authApi.register,
    onMutate: () => {
      setLoading(true)
    },
    onSuccess: (data) => {
      // Update auth store (which will handle localStorage)
      setAuth(data.user, data.tokens)
      
      toast.success('Account created successfully!')
      router.push(ROUTES.DASHBOARD)
    },
    onError: (error: any) => {
      console.error('Register error:', error)
      const message = error.response?.data?.detail || 'Registration failed'
      toast.error(message)
    },
    onSettled: () => {
      setLoading(false)
    },
  })
}

export function useLogout() {
  const router = useRouter()
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      clearAuth()
      queryClient.clear()
      toast.success('Logged out successfully')
      router.push(ROUTES.LOGIN)
    },
    onError: () => {
      // Clear auth even if logout request fails
      clearAuth()
      queryClient.clear()
      router.push(ROUTES.LOGIN)
    },
  })
}

export function useProfile() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return useQuery({
    queryKey: ['profile'],
    queryFn: authApi.getProfile,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const updateUser = useAuthStore((state) => state.updateUser)

  return useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (data) => {
      updateUser(data)
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Profile updated successfully')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Profile update failed'
      toast.error(message)
    },
  })
}

export function useRefreshToken() {
  const setAuth = useAuthStore((state) => state.setAuth)
  const clearAuth = useAuthStore((state) => state.clearAuth)

  return useMutation({
    mutationFn: authApi.refresh,
    onSuccess: (data) => {
      // Update auth store (which will handle localStorage)
      setAuth(data.user, data.tokens)
    },
    onError: (error) => {
      console.error('Refresh token error:', error)
      clearAuth() // This will clear both localStorage and store
    },
  })
}