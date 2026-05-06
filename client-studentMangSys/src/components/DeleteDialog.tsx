import {
  Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, Button, CircularProgress,
} from '@mui/material';
import { useState } from 'react';
import type { Student } from '../types/student';

interface Props {
  open: boolean;
  student?: Student | null;
  onClose: () => void;
  onConfirm: (id: number) => Promise<void>;
}

export default function DeleteDialog({ open, student, onClose, onConfirm }: Props) {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    if (!student) return;
    setDeleting(true);
    try {
      await onConfirm(student.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Student</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to delete <strong>{student?.firstName} {student?.lastName}</strong>?
          This action cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>Cancel</Button>
        <Button color="error" variant="contained" onClick={handleConfirm} disabled={deleting}
          startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : null}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
