import { useEffect, useState } from 'react';
import {
  Container, Typography, Button, Box, Alert, Snackbar, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import StudentTable from './components/StudentTable';
import StudentForm from './components/StudentForm';
import DeleteDialog from './components/DeleteDialog';
import { getStudents, createStudent, updateStudent, deleteStudent } from './api/studentApi';
import type { Student, StudentFormData } from './types/student';

export default function App() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Student | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      setStudents(await getStudents());
    } catch {
      setError('Failed to load students. Make sure the API server is running on port 3000.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStudents(); }, []);

  const handleSave = async (data: StudentFormData, id?: number) => {
    if (id) {
      await updateStudent(id, data);
      setToast('Student updated successfully');
    } else {
      await createStudent(data);
      setToast('Student created successfully');
    }
    await fetchStudents();
  };

  const handleDelete = async (id: number) => {
    await deleteStudent(id);
    setToast('Student deleted successfully');
    await fetchStudents();
  };

  const openAdd = () => { setEditTarget(null); setFormOpen(true); };
  const openEdit = (s: Student) => { setEditTarget(s); setFormOpen(true); };
  const openDelete = (s: Student) => { setDeleteTarget(s); setDeleteOpen(true); };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Student Management</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<RefreshIcon />} onClick={fetchStudents} disabled={loading}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
            Add Student
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <StudentTable students={students} onEdit={openEdit} onDelete={openDelete} />
      )}

      <StudentForm
        open={formOpen}
        student={editTarget}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />

      <DeleteDialog
        open={deleteOpen}
        student={deleteTarget}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Container>
  );
}
