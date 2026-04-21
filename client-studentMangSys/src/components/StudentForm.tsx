import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Grid, CircularProgress,
} from '@mui/material';
import type { Student, StudentFormData } from '../types/student';

const empty: StudentFormData = {
  firstName: '', lastName: '', email: '',
  age: null, grade: null, phone: null, address: null, enrollmentDate: null,
};

interface Props {
  open: boolean;
  student?: Student | null;
  onClose: () => void;
  onSave: (data: StudentFormData, id?: number) => Promise<void>;
}

export default function StudentForm({ open, student, onClose, onSave }: Props) {
  const [form, setForm] = useState<StudentFormData>(empty);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof StudentFormData, string>>>({});

  useEffect(() => {
    if (student) {
      setForm({
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        age: student.age ?? null,
        grade: student.grade ?? null,
        phone: student.phone ?? null,
        address: student.address ?? null,
        enrollmentDate: student.enrollmentDate
          ? new Date(student.enrollmentDate).toISOString().split('T')[0]
          : null,
      });
    } else {
      setForm(empty);
    }
    setErrors({});
  }, [student, open]);

  const validate = () => {
    const e: Partial<Record<keyof StudentFormData, string>> = {};
    if (!form.firstName.trim()) e.firstName = 'Required';
    if (!form.lastName.trim()) e.lastName = 'Required';
    if (!form.email.trim()) e.email = 'Required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email';
    return e;
  };

  const handleChange = (field: keyof StudentFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value || null }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      await onSave(form, student?.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{student ? 'Edit Student' : 'Add Student'}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={6}>
            <TextField label="First Name" fullWidth required value={form.firstName}
              onChange={handleChange('firstName')} error={!!errors.firstName} helperText={errors.firstName} />
          </Grid>
          <Grid size={6}>
            <TextField label="Last Name" fullWidth required value={form.lastName}
              onChange={handleChange('lastName')} error={!!errors.lastName} helperText={errors.lastName} />
          </Grid>
          <Grid size={12}>
            <TextField label="Email" fullWidth required value={form.email}
              onChange={handleChange('email')} error={!!errors.email} helperText={errors.email} />
          </Grid>
          <Grid size={6}>
            <TextField label="Age" fullWidth type="number" value={form.age ?? ''}
              onChange={handleChange('age')} />
          </Grid>
          <Grid size={6}>
            <TextField label="Grade" fullWidth value={form.grade ?? ''}
              onChange={handleChange('grade')} />
          </Grid>
          <Grid size={6}>
            <TextField label="Phone" fullWidth value={form.phone ?? ''}
              onChange={handleChange('phone')} />
          </Grid>
          <Grid size={6}>
            <TextField label="Enrollment Date" fullWidth type="date"
              value={form.enrollmentDate ?? ''} onChange={handleChange('enrollmentDate')}
              slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={12}>
            <TextField label="Address" fullWidth value={form.address ?? ''}
              onChange={handleChange('address')} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : null}>
          {student ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
