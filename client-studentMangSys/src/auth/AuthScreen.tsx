import { useState } from 'react';
import { Container, Paper, Tabs, Tab, TextField, Button, Typography, Alert, Box } from '@mui/material';
import { useAuth } from './AuthContext';

type Mode = 'login' | 'signup';

export default function AuthScreen() {
  const { signIn, signUp, confirmSignUp, resendCode } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setError(null);
    setInfo(null);
  };

  const handleLogin = async () => {
    reset();
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async () => {
    reset();
    setSubmitting(true);
    try {
      await signUp(email, password);
      setAwaitingConfirmation(true);
      setInfo('Account created. Check your email for a verification code.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign up.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    reset();
    setSubmitting(true);
    try {
      await confirmSignUp(email, code);
      setInfo('Account confirmed — you can sign in now.');
      setAwaitingConfirmation(false);
      setMode('login');
      setCode('');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    reset();
    try {
      await resendCode(email);
      setInfo('Verification code resent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code.');
    }
  };

  return (
    <Container maxWidth="xs" sx={{ py: 8 }}>
      <Paper sx={{ p: 4 }} elevation={2}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, textAlign: 'center' }}>
          Student Management
        </Typography>

        {!awaitingConfirmation && (
          <Tabs
            value={mode}
            onChange={(_e, value: Mode) => {
              setMode(value);
              reset();
            }}
            sx={{ mb: 3 }}
            variant="fullWidth"
          >
            <Tab label="Sign In" value="login" />
            <Tab label="Sign Up" value="signup" />
          </Tabs>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {info && <Alert severity="success" sx={{ mb: 2 }}>{info}</Alert>}

        {awaitingConfirmation ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Enter the verification code sent to {email}.
            </Typography>
            <TextField label="Verification code" value={code} onChange={(e) => setCode(e.target.value)} fullWidth />
            <Button variant="contained" onClick={handleConfirm} disabled={submitting || !code}>
              Confirm
            </Button>
            <Button onClick={handleResend} disabled={submitting}>
              Resend code
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              helperText={mode === 'signup' ? 'At least 8 characters, with upper, lower and a digit.' : undefined}
            />
            <Button
              variant="contained"
              onClick={mode === 'login' ? handleLogin : handleSignup}
              disabled={submitting || !email || !password}
            >
              {mode === 'login' ? 'Sign In' : 'Create account'}
            </Button>
          </Box>
        )}
      </Paper>
    </Container>
  );
}
