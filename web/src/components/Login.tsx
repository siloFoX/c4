import { AlertTriangle, KeyRound, LogIn, User } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from './ui';
import Spinner from './Spinner';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import { useLogin } from '../lib/use-login';

interface LoginProps {
  onSuccess: () => void;
}

const DOTTED_PATTERN =
  'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)';

export default function Login({ onSuccess }: LoginProps) {
  useLocale();
  // (v1.10.719) Form state + submit handler moved to use-login hook.
  const { user, setUser, password, setPassword, error, busy, handleSubmit } =
    useLogin({ onSuccess });

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-5 text-foreground"
        style={{ backgroundImage: DOTTED_PATTERN, backgroundSize: '24px 24px' }}
      />
      <Card className="relative w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('login.title')}</CardTitle>
          <CardDescription>
            {t('login.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c4-user">{t('login.user')}</Label>
              <div className="relative">
                <User
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="c4-user"
                  type="text"
                  autoComplete="username"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c4-password">{t('login.password')}</Label>
              <div className="relative">
                <KeyRound
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="c4-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className={cn(
                  'flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
                )}
              >
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">{error}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="default"
              size="md"
              className="w-full"
              disabled={busy}
            >
              {busy ? (
                <Spinner size="md" color="inverse" aria-hidden="true" data-testid="login-spinner" />
              ) : (
                <LogIn aria-hidden="true" className="h-4 w-4" />
              )}
              <span>{busy ? t('login.submitting') : t('login.submit')}</span>
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center pt-2">
          <p className="text-xs text-muted-foreground">
            {t('login.footer')}
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
