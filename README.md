# Student Management System

A full-stack CRUD application for managing student records, built with Node.js, Express, Prisma, PostgreSQL, React, and TypeScript.

---

## Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) v18+
- [Docker](https://www.docker.com/) & Docker Compose
- [PostgreSQL](https://www.postgresql.org/) (only if running locally without Docker)

---

## Option 1: Run with Docker (Recommended)

This runs the API and PostgreSQL database together in containers. You only need Docker installed.

**1. Clone the repository**

```bash
git clone <your-repo-url>
cd Student-Management-System
```

**2. Build and start the containers**

```bash
docker compose up --build
```

This will:
- Build the API Docker image from `api-studentMangSys/Dockerfile`
- Start a PostgreSQL 16 container
- Run Prisma migrations automatically
- Start the API server on `http://localhost:3000`

**3. Start the frontend**

In a separate terminal:

```bash
cd client-studentMangSys
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173`.

**4. Stop the containers**

```bash
docker compose down
```

To also remove the database volume:

```bash
docker compose down -v
```

---

## Option 2: Run Locally (Without Docker)

### Backend (API)

**1. Install dependencies**

```bash
cd api-studentMangSys
npm install
```

**2. Set up the environment**

Create a `.env` file inside `api-studentMangSys/`:

```env
DATABASE_URL=postgresql://postgres:root@localhost:5432/student_management?schema=public
PORT=3000
```

Make sure your local PostgreSQL is running and the `student_management` database exists.

**3. Run Prisma migrations**

```bash
npx prisma migrate deploy
```

**4. Start the development server**

```bash
npm run dev
```

The API will run at `http://localhost:3000`.

---

### Frontend (Client)

**1. Install dependencies**

```bash
cd client-studentMangSys
npm install
```

**2. Start the development server**

```bash
npm run dev
```

The frontend will run at `http://localhost:5173`.

---

## Build the Docker Image Manually

If you want to build just the API image without Docker Compose:

```bash
cd api-studentMangSys
docker build -t student-mgmt-api .
```

Run the image (requires a running PostgreSQL instance):

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://postgres:root@host.docker.internal:5432/student_management?schema=public \
  -e NODE_ENV=production \
  -e PORT=3000 \
  student-mgmt-api
```

---

## API Endpoints

| Method | Endpoint            | Description         |
|--------|---------------------|---------------------|
| GET    | `/students`         | Get all students    |
| POST   | `/students`         | Create a student    |
| PUT    | `/students/:id`     | Update a student    |
| DELETE | `/students/:id`     | Delete a student    |
| GET    | `/health`           | Health check        |

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Backend   | Node.js, Express.js, TypeScript     |
| ORM       | Prisma                              |
| Database  | PostgreSQL 16                       |
| Frontend  | React, TypeScript, Vite, MUI        |
| DevOps    | Docker, Docker Compose              |
