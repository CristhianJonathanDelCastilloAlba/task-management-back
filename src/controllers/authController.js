const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');

const generateTokens = (userId) => {
    const accessToken = jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
        { userId, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
    );

    return { accessToken, refreshToken };
};

const register = async (req, res) => {
    try {
        const { name, last_name, phone, email, position } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }

        const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'El email ya está registrado' });
        }

        const defaultPassword = process.env.DEFAULT_PASSWORD || 'Pass123$';
        console.log('Creando usuario con contraseña por defecto:', defaultPassword);

        const { data, error } = await supabaseAdmin
            .from('users')
            .insert([{
                name,
                last_name: last_name || null,
                phone: phone || null,
                email: email || null,
                position: position || null,
                password_hash: defaultPassword,
                role: 'user',
                is_active: true
            }])
            .select();

        if (error) throw error;

        const tokens = generateTokens(data[0].id);
        const userResponse = { ...data[0] };
        delete userResponse.password_hash;

        res.status(201).json({
            message: 'Usuario creado exitosamente',
            user: userResponse,
            tokens
        });
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ error: error.message });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email y contraseña son requeridos'
            });
        }

        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('email', email)
            .eq('is_active', true)
            .single();

        if (error || !user) {
            return res.status(401).json({
                error: 'Credenciales inválidas'
            });
        }

        const { data: passwordCheck, error: passwordError } = await supabaseAdmin
            .rpc('check_password', {
                p_password: password,
                p_stored_hash: user.password_hash
            });

        if (passwordError || !passwordCheck) {
            return res.status(401).json({
                error: 'Credenciales inválidas'
            });
        }

        await supabaseAdmin
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id);

        const tokens = generateTokens(user.id);
        const userResponse = { ...user };
        delete userResponse.password_hash;

        res.json({
            message: 'Login exitoso',
            user: userResponse,
            tokens
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: error.message });
    }
};

const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token requerido' });
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

        if (decoded.type !== 'refresh') {
            return res.status(401).json({ error: 'Token inválido' });
        }

        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('id', decoded.userId)
            .eq('is_active', true)
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Usuario no encontrado' });
        }

        const tokens = generateTokens(user.id);

        res.json({ tokens });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Refresh token expirado' });
        }
        return res.status(401).json({ error: 'Refresh token inválido' });
    }
};

const getProfile = async (req, res) => {
    try {
        const user = req.user;

        const userResponse = { ...user };
        delete userResponse.password_hash;

        res.json(userResponse);
    } catch (error) {
        console.error('Error obteniendo perfil:', error);
        res.status(500).json({ error: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const updates = req.body;

        delete updates.id;
        delete updates.password_hash;
        delete updates.role;
        delete updates.is_active;
        delete updates.created_at;

        const { data, error } = await supabaseAdmin
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select();

        if (error) throw error;

        const userResponse = { ...data[0] };
        delete userResponse.password_hash;

        res.json({
            message: 'Perfil actualizado exitosamente',
            user: userResponse
        });
    } catch (error) {
        console.error('Error actualizando perfil:', error);
        res.status(500).json({ error: error.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                error: 'Contraseña actual y nueva contraseña son requeridas'
            });
        }

        const { data: user, error: fetchError } = await supabaseAdmin
            .from('users')
            .select('password_hash')
            .eq('id', userId)
            .single();

        if (fetchError) throw fetchError;

        const { data: passwordCheck, error: passwordError } = await supabaseAdmin
            .rpc('check_password', {
                p_password: currentPassword,
                p_stored_hash: user.password_hash
            });

        if (passwordError || !passwordCheck) {
            return res.status(401).json({
                error: 'Contraseña actual incorrecta'
            });
        }

        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({ password_hash: newPassword })
            .eq('id', userId);

        if (updateError) throw updateError;

        res.json({ message: 'Contraseña cambiada exitosamente' });
    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        res.status(500).json({ error: error.message });
    }
};

const logout = async (req, res) => {
    res.json({ message: 'Logout exitoso' });
};

module.exports = {
    register,
    login,
    refreshToken,
    getProfile,
    updateProfile,
    changePassword,
    logout
};