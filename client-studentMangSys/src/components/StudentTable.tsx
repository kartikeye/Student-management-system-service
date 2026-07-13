import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Tooltip, Typography, Box, Chip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import type { Student } from '../types/student';

interface Props {
  students: Student[];
  onEdit: (student: Student) => void;
  onDelete: (student: Student) => void;
  canDelete: boolean;
}

export default function StudentTable({ students, onEdit, onDelete, canDelete }: Props) {
  if (students.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">No students found. Add one to get started.</Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper} elevation={2}>
      <Table>
        <TableHead sx={{ bgcolor: 'primary.main' }}>
          <TableRow>
            {['ID', 'Name', 'Email', 'Age', 'Grade', 'Phone', 'Enrolled', 'Actions'].map((h) => (
              <TableCell key={h} sx={{ color: 'white', fontWeight: 700 }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {students.map((s) => (
            <TableRow key={s.id} hover>
              <TableCell>{s.id}</TableCell>
              <TableCell>{s.firstName} {s.lastName}</TableCell>
              <TableCell>{s.email}</TableCell>
              <TableCell>{s.age ?? '—'}</TableCell>
              <TableCell>
                {s.grade ? <Chip label={s.grade} size="small" color="primary" variant="outlined" /> : '—'}
              </TableCell>
              <TableCell>{s.phone ?? '—'}</TableCell>
              <TableCell>
                {s.enrollmentDate ? new Date(s.enrollmentDate).toLocaleDateString() : '—'}
              </TableCell>
              <TableCell>
                <Tooltip title="Edit">
                  <IconButton color="primary" onClick={() => onEdit(s)} size="small">
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {canDelete && (
                  <Tooltip title="Delete">
                    <IconButton color="error" onClick={() => onDelete(s)} size="small">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
