'use client'

import { useState } from 'react'
import { Share2, Copy, QrCode, Users, Clock, Check } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { TranslationSession } from '@/types'
import { useGenerateInviteCode, useGenerateShareLink } from '@/hooks/use-sessions'

interface SessionSharingPanelProps {
  session: TranslationSession
  className?: string
}

export function SessionSharingPanel({ session, className }: SessionSharingPanelProps) {
  const [open, setOpen] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // Use the API hooks
  const generateInviteCodeMutation = useGenerateInviteCode()
  const generateShareLinkMutation = useGenerateShareLink()

  const generateInviteCode = async () => {
    try {
      const result = await generateInviteCodeMutation.mutateAsync(session.session_id)
      setInviteCode(result.invite_code)
    } catch (error) {
      console.error('Error generating invite code:', error)
    }
  }

  const generateShareLink = async () => {
    try {
      const result = await generateShareLinkMutation.mutateAsync(session.session_id)
      setShareLink(result.share_link)
    } catch (error) {
      console.error('Error generating share link:', error)
    }
  }

  const copyToClipboard = async (text: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'code') {
        setCopiedCode(true)
        setTimeout(() => setCopiedCode(false), 2000)
      } else {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
      }
      toast.success(`${type === 'code' ? 'Invite code' : 'Share link'} copied to clipboard!`)
    } catch (error) {
      toast.error('Failed to copy to clipboard')
    }
  }

  const shareViaWhatsApp = () => {
    if (!shareLink) return
    const message = `Join my translation session: ${shareLink}`
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }

  const shareViaEmail = () => {
    if (!shareLink) return
    const subject = 'Join my translation session'
    const body = `Hi! I'd like to invite you to join my translation session.

Click this link to join: ${shareLink}

Or use invite code: ${inviteCode || 'Generate code first'}

Languages: ${session.language_a} ⇄ ${session.language_b}

See you there!`
    
    const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(url)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Share2 className="h-4 w-4 mr-2" />
          Share Session
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Translation Session</DialogTitle>
          <DialogDescription>
            Choose how to share this session with another person
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="invite-code" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="invite-code">
              <Users className="h-4 w-4 mr-2" />
              Code
            </TabsTrigger>
            <TabsTrigger value="share-link">
              <Share2 className="h-4 w-4 mr-2" />
              Link
            </TabsTrigger>
            <TabsTrigger value="qr-code">
              <QrCode className="h-4 w-4 mr-2" />
              QR
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invite-code" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">6-Digit Invite Code</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex space-x-2">
                  <Input
                    value={inviteCode || ''}
                    readOnly
                    placeholder="Click generate to create code"
                    className="font-mono text-center text-lg tracking-widest"
                  />
                  <Button
                    onClick={generateInviteCode}
                    disabled={generateInviteCodeMutation.isPending}
                    size="sm"
                  >
                    {generateInviteCodeMutation.isPending ? 'Generating...' : 'Generate'}
                  </Button>
                </div>
                
                {inviteCode && (
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => copyToClipboard(inviteCode, 'code')}
                      className="flex-1"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Code
                        </>
                      )}
                    </Button>
                  </div>
                )}
                
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  <span>Expires in 24 hours</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="share-link" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Direct Share Link</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex space-x-2">
                  <Input
                    value={shareLink || ''}
                    readOnly
                    placeholder="Click generate to create link"
                    className="text-sm"
                  />
                  <Button
                    onClick={generateShareLink}
                    disabled={generateShareLinkMutation.isPending}
                    size="sm"
                  >
                    {generateShareLinkMutation.isPending ? 'Generating...' : 'Generate'}
                  </Button>
                </div>
                
                {shareLink && (
                  <div className="space-y-2">
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => copyToClipboard(shareLink, 'link')}
                        className="flex-1"
                      >
                        {copiedLink ? (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Link
                          </>
                        )}
                      </Button>
                    </div>
                    
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        onClick={shareViaWhatsApp}
                        className="flex-1 text-green-600"
                      >
                        WhatsApp
                      </Button>
                      <Button
                        variant="outline"
                        onClick={shareViaEmail}
                        className="flex-1 text-blue-600"
                      >
                        Email
                      </Button>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  <span>Expires in 4 hours</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="qr-code" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">QR Code</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {shareLink ? (
                  <div className="text-center">
                    <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center mx-auto">
                      <span className="text-sm text-gray-500">
                        QR Code would be here
                        <br />
                        (Install QR library)
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      Scan with mobile device to join
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <Button onClick={generateShareLink} disabled={generateShareLinkMutation.isPending}>
                      {generateShareLinkMutation.isPending ? 'Generating...' : 'Generate QR Code'}
                    </Button>
                    <p className="text-sm text-gray-600 mt-2">
                      Generate a share link first
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Session Info */}
        <Card className="mt-4">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Languages:</span>
              <div className="flex items-center space-x-2">
                <Badge variant="outline">{session.language_a}</Badge>
                <span>⇄</span>
                <Badge variant="outline">{session.language_b}</Badge>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-gray-600">Status:</span>
              <Badge variant={session.status === 'active' ? 'default' : 'secondary'}>
                {session.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}
