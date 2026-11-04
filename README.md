# PingPongBros

This workspace contains a full-stack management system for a table tennis venue, inspired by the provided design and business requirements.

## Structure

- `frontend/` — React + TypeScript + Vite dashboard UI
- `backend/` — Express + TypeScript API and Prisma model definitions
- `database/` — PostgreSQL schema and seed data for the venue domain

## Quick start

1. Install frontend dependencies: `cd frontend && npm install`
2. Install backend dependencies: `cd backend && npm install`
3. Start the backend: `cd backend && npm run dev`
4. Start the frontend: `cd frontend && npm run dev`

The frontend expects the backend on `http://localhost:4000`.
