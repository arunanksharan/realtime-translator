'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Users, Link } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useJoinByCode } from '@/hooks/use-sessions';

const inviteCodeSchema = z.object({
  invite_code: z
    .string()
    .min(6, 'Invite code must be 6 characters')
    .max(6, 'Invite code must be 6 characters'),
});

const sessionLinkSchema = z.object({
  session_url: z.string().url('Please enter a valid session URL'),
});

type InviteCodeForm = z.infer<typeof inviteCodeSchema>;
type SessionLinkForm = z.infer<typeof sessionLinkSchema>;

interface JoinSessionDialogProps {
  trigger?: React.ReactNode;
  className?: string;
}

export function JoinSessionDialog({
  trigger,
  className,
}: JoinSessionDialogProps) {
  const [open, setOpen] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const router = useRouter();
  
  // Add the missing hook
  const joinByCodeMutation = useJoinByCode();

  const codeForm = useForm<InviteCodeForm>({
    resolver: zodResolver(inviteCodeSchema),
    defaultValues: {
      invite_code: '',
    },
  });

  const linkForm = useForm<SessionLinkForm>({
    resolver: zodResolver(sessionLinkSchema),
    defaultValues: {
      session_url: '',
    },
  });

  const handleJoinByCode = async (data: InviteCodeForm) => {
    try {
      const result = await joinByCodeMutation.mutateAsync(data.invite_code);

      // Navigate to session
      router.push(`/session/${result.session_id}`);
      setOpen(false);
    } catch (error) {
      console.error('Join by code error:', error);
      // Error handling is done in the mutation hook
    }
  };

  const handleJoinByLink = async (data: SessionLinkForm) => {
    setIsJoining(true);
    try {
      // Extract session ID from URL
      const url = new URL(data.session_url);
      const sessionId = url.pathname.split('/').pop();

      if (!sessionId) {
        throw new Error('Invalid session URL');
      }

      // Navigate directly to session - the session page will handle join logic
      router.push(data.session_url);
      setOpen(false);
      toast.success('Joining session...');
    } catch (error) {
      toast.error('Invalid session URL. Please check the link.');
      console.error('Join by link error:', error);
    } finally {
      setIsJoining(false);
    }
  };

  const formatInviteCode = (value: string) => {
    // Convert to uppercase and limit to 6 characters
    return value.toUpperCase().slice(0, 6);
  };

  const handleCodeChange = (value: string) => {
    const formatted = formatInviteCode(value);
    codeForm.setValue('invite_code', formatted);
  };

  const defaultTrigger = (
    <Card className="hover:shadow-md transition-shadow cursor-pointer">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center space-x-2">
          <Users className="h-5 w-5" />
          <span>Join Session</span>
        </CardTitle>
        <CardDescription>Join an existing translation session</CardDescription>
      </CardHeader>
    </Card>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join Translation Session</DialogTitle>
          <DialogDescription>
            Join an existing session using an invite code or session link
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="invite-code" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="invite-code">
              <Users className="h-4 w-4 mr-2" />
              Invite Code
            </TabsTrigger>
            <TabsTrigger value="session-link">
              <Link className="h-4 w-4 mr-2" />
              Session Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invite-code" className="space-y-4">
            <form
              onSubmit={codeForm.handleSubmit(handleJoinByCode)}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="invite_code">6-Digit Invite Code</Label>
                <Input
                  id="invite_code"
                  placeholder="ABC123"
                  className="font-mono text-center text-lg tracking-widest"
                  {...codeForm.register('invite_code')}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  maxLength={6}
                />
                {codeForm.formState.errors.invite_code && (
                  <p className="text-sm text-red-500">
                    {codeForm.formState.errors.invite_code.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={
                  joinByCodeMutation.isPending || !codeForm.formState.isValid
                }
              >
                {joinByCodeMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  'Join Session'
                )}
              </Button>
            </form>

            <div className="text-center text-sm text-gray-600">
              <p>Ask the session creator for a 6-digit invite code</p>
            </div>
          </TabsContent>

          <TabsContent value="session-link" className="space-y-4">
            <form
              onSubmit={linkForm.handleSubmit(handleJoinByLink)}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="session_url">Session Link</Label>
                <Input
                  id="session_url"
                  placeholder="https://translator.app/session/..."
                  className="text-sm"
                  {...linkForm.register('session_url')}
                />
                {linkForm.formState.errors.session_url && (
                  <p className="text-sm text-red-500">
                    {linkForm.formState.errors.session_url.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isJoining || !linkForm.formState.isValid}
              >
                {isJoining ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  'Join Session'
                )}
              </Button>
            </form>

            <div className="text-center text-sm text-gray-600">
              <p>Paste the session link shared by the session creator</p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
