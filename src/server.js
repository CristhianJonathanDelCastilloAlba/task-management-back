const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const BASE_PATH = process.env.BASE_PATH || '';
const app = express();
const PORT = process.env.PORT || 3000;

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Demasiadas solicitudes desde esta IP, por favor intenta más tarde'
});

app.use(helmet());
app.use(limiter);
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:4200',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(BASE_PATH + '/uploads', express.static(path.join(__dirname, '../uploads')));

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const taskRoutes = require('./routes/taskRoutes');
const projectRoutes = require('./routes/projectRoutes');
const moduleRoutes = require('./routes/moduleRoutes');
const notificationsRoutes = require('./routes/notificationRoutes');
const subtaskRoutes = require('./routes/subtaskRoutes');

app.use(BASE_PATH + '/api/auth', authRoutes);
app.use(BASE_PATH + '/api/users', userRoutes);
app.use(BASE_PATH + '/api/tasks', taskRoutes);
app.use(BASE_PATH + '/api/projects', projectRoutes);
app.use(BASE_PATH + '/api/modules', moduleRoutes);
app.use(BASE_PATH + '/api/notifications', notificationsRoutes);
app.use(BASE_PATH + '/api/subtasks', subtaskRoutes);

app.get(BASE_PATH + '/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Servidor de gestión de tareas funcionando',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

app.get(BASE_PATH + '/api/verify-auth', (req, res) => {
    const token = req.headers.authorization.split(' ')[1];
    res.json({ authenticated: !!token });
});

app.use((req, res, next) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
    console.error('Error en servidor:', err.stack);
    res.status(500).json({
        error: 'Error interno del servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

const fs = require('fs');
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

app.listen(PORT, () => {
    console.log(`
  Servidor backend iniciado
  Puerto: ${PORT}
  `);
});
