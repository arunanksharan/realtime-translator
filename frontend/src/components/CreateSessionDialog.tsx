'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCreateSession } from '@/hooks/use-sessions'
import { SUPPORTED_LANGUAGES } from '@/lib/constants'
import { getLanguageName, getLanguageFlag } from '@/lib/utils'

const createSessionSchema = z.object({
  language_a: z.string().min(1, 'Please select your language'),
  language_b: z.string().min(1, 'Please select the other language'),
}).refine((data) => data.language_a !== data.language_b, {
  message: "Languages must be different",
  path: ["language_b"],
})

type CreateSessionForm = z.infer<typeof createSessionSchema>

interface CreateSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (sessionId: string) => void
}

export function CreateSessionDialog({ open, onOpenChange, onSuccess }: CreateSessionDialogProps) {
  const createMutation = useCreateSession()

  const {
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isValid },
    reset,
  } = useForm<CreateSessionForm>({
    resolver: zodResolver(createSessionSchema),
    mode: 'onChange',
  })

  const language_a = watch('language_a')
  const language_b = watch('language_b')

  const onSubmit = (data: CreateSessionForm) => {
    createMutation.mutate(data, {
      onSuccess: (sessionData) => {
        onOpenChange(false)
        reset()
        // Call the onSuccess callback with the session ID
        if (onSuccess && sessionData.session_id) {
          onSuccess(sessionData.session_id)
        }
      },
    })
  }

  const handleClose = () => {
    onOpenChange(false)
    reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Translation Session</DialogTitle>
          <DialogDescription>
            Select the languages for your real-time translation session
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="language_a">Your Language</Label>
              <Select onValueChange={(value) => setValue('language_a', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your language" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      <div className="flex items-center space-x-2">
                        <span className="language-flag">{lang.flag}</span>
                        <span>{lang.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.language_a && (
                <p className="text-sm text-red-500">{errors.language_a.message}</p>
              )}
            </div>

            <div className="flex items-center justify-center py-2">
              <div className="w-full border-t border-gray-300" />
              <div className="px-4 text-sm text-gray-500">translates to</div>
              <div className="w-full border-t border-gray-300" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language_b">Other Person's Language</Label>
              <Select onValueChange={(value) => setValue('language_b', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select their language" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.filter(lang => lang.code !== language_a).map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      <div className="flex items-center space-x-2">
                        <span className="language-flag">{lang.flag}</span>
                        <span>{lang.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.language_b && (
                <p className="text-sm text-red-500">{errors.language_b.message}</p>
              )}
            </div>
          </div>

          {/* Preview */}
          {language_a && language_b && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                Translation Preview:
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center space-x-2">
                  <span className="language-flag">{getLanguageFlag(language_a)}</span>
                  <span>{getLanguageName(language_a)}</span>
                </span>
                <span className="text-blue-600 dark:text-blue-400">⟷</span>
                <span className="flex items-center space-x-2">
                  <span className="language-flag">{getLanguageFlag(language_b)}</span>
                  <span>{getLanguageName(language_b)}</span>
                </span>
              </div>
            </div>
          )}

          <div className="flex space-x-3">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1"
              onClick={handleClose}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="flex-1"
              disabled={!isValid || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Session'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
