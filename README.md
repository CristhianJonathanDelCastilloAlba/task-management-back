# 🧩 Task Management API

API REST para la gestión de proyectos y tareas.

---

## 🚀 Tecnologías

* Node.js
* Supabase
* JWT
* dotenv

---

## 📦 Instalación

```bash
git clone https://github.com/CristhianJonathanDelCastilloAlba/task-management-back.git
cd task-management-back
npm install
```

---

## ⚙️ Configuración

Crear archivo `.env`:

```env# Puerto del servidor
PORT=3000

# Credenciales de Supabase
SUPABASE_URL=https://tu-dominio.supabase.co
SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=sb_publishable_tu-role-key-

# JWT Configuración
JWT_SECRET=tu-secret-jwt
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=tu-refresh-token
JWT_REFRESH_EXPIRES_IN=30d

# Configuración de la aplicación
NODE_ENV=development
FRONTEND_URL=tu-url-frontend
DEFAULT_PASSWORD=tu-password
BASE_PATH=

# Configuración de correo SMTP
SMTP_FROM=noreply@tuproyecto.com
MAILTRAP_TOKEN=tu-mail-trap-token

# Configuración de recuperación de contraseña
PASSWORD_RESET_URL=http://localhost:4200/reset-password
```

---

## ▶️ Ejecutar

```bash
npm run dev
```

## 🔐 Autenticación

Usa JWT:

```
Authorization: Bearer <token>
```

---

## 👨‍💻 Autor

Cristhian Jonathan Del Castillo Alba
