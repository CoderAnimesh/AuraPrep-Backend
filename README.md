<!-- Backend Header Banner -->
<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=slice&color=gradient&customColorList=5,12,24&height=180&section=header&text=AuraPrep%20Backend%20API%20%E2%9A%A1&fontSize=50&fontColor=ffffff&animation=twinkle" width="100%" alt="AuraPrep Backend Banner"/>

  <a href="https://git.io/typing-svg">
    <img src="https://readme-typing-svg.herokuapp.com/?lines=Express+5.0+%2B+TypeScript+REST+API;Drizzle+ORM+%2B+SQLite+%2F+PostgreSQL;JWT+Authentication+%2B+Bcrypt+Security;Active+Health-Check+Engine+(Anti-Sleep)%E2%9D%A4%EF%B8%8F&center=true&width=550&height=40&color=38BDF8&vCenter=true&size=19" alt="Backend Typing SVG"/>
  </a>

  <p align="center">
    <img src="https://img.shields.io/badge/NodeJS-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="NodeJS"/>
    <img src="https://img.shields.io/badge/Express-5.0-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express"/>
    <img src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black" alt="Drizzle ORM"/>
    <img src="https://img.shields.io/badge/Health--Check-Enabled-brightgreen?style=for-the-badge&logo=googleheart&logoColor=white" alt="Health Check Enabled"/>
  </p>
</div>

---

## 🚀 Backend Overview

The **AuraPrep Backend** is a lightweight, scalable RESTful API powering the AuraPrep platform. It manages user authentication, study plans, vocabulary word banks, practice quizzes, and incorporates a dedicated server keep-alive mechanism to keep cloud hosts (Render, Railway, Heroku) active 24/7.

---

## 📡 REST API Route Directory

<details open>
<summary><b>❤️ Server Health & Keep-Alive (Anti-Sleep)</b></summary>

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET / HEAD` | `/health` | Primary keep-alive health route | ❌ No |
| `GET / HEAD` | `/api/health` | API alias health route | ❌ No |

#### Example Response:
```json
{
  "status": "ok",
  "message": "Server is active and healthy",
  "timestamp": "2026-08-07T15:05:00.000Z",
  "uptime": 3600.42
}
```
</details>

<details>
<summary><b>🔐 Authentication Routes (`/api/auth`)</b></summary>

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new user account |
| `POST` | `/api/auth/login` | Authenticate user & issue JWT token |
| `GET` | `/api/auth/me` | Fetch authenticated profile details |
</details>

<details>
<summary><b>📚 Vocabulary Routes (`/api/vocab`)</b></summary>

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/vocab/groups` | Get word groups and categories |
| `GET` | `/api/vocab/words` | Query vocabulary word lists |
| `POST` | `/api/vocab/progress` | Save flashcard progress state |
</details>

<details>
<summary><b>🔢 Practice Routes (`/api/practice`)</b></summary>

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/practice/questions` | Fetch quantitative & verbal questions |
| `POST` | `/api/practice/submit` | Submit answers and return evaluations |
</details>

---

## 🛠️ Tech Stack & Dependencies

- **Framework**: Express.js 5
- **Language**: TypeScript (transpiled with `tsx`)
- **Database**: Drizzle ORM with Better-SQLite3 / Postgres
- **Security**: JSON Web Tokens (`jsonwebtoken`), `bcryptjs`, CORS middleware
- **Environment**: `dotenv`

---

## ⚙️ Setup & Development Commands

```bash
# 1. Install dependencies
npm install

# 2. Generate database migrations
npm run db:generate

# 3. Apply database migrations
npm run db:migrate

# 4. Seed initial database data
npm run db:seed

# 5. Start development server with live reload
npm run dev
```

---

## 🔒 Environment Variables (`.env`)

Create a `.env` file in the backend root directory (ignored by git):

```env
PORT=5000
JWT_SECRET=your_super_secret_jwt_key
DATABASE_URL=sqlite.db
NODE_ENV=development
```

---

<div align="center">
  <sub>AuraPrep Backend Engine — Fast, Secure, Always Awake.</sub>
</div>
