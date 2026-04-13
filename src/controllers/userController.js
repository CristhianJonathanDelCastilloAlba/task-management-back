const { supabaseAdmin } = require('../config/supabase');

const getUsers = async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('users')
            .select('id, name, last_name, email, phone, position, role, is_active, created_at, last_login')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        res.status(500).json({ error: error.message });
    }
};

const createUser = async (req, res) => {
    try {
        const { name, last_name, phone, email, position, role = 'user' } = req.body;

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
                role: role,
                is_active: true
            }])
            .select('id, name, last_name, email, phone, position, role, is_active, created_at');

        if (error) throw error;

        res.status(201).json({
            message: 'Usuario creado exitosamente',
            user: data[0],
            defaultPassword: defaultPassword
        });
    } catch (error) {
        console.error('Error creando usuario:', error);
        res.status(500).json({ error: error.message });
    }
};

const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const currentUser = req.user;

        if (currentUser.role !== 'admin' && currentUser.id !== id) {
            return res.status(403).json({
                error: 'No tienes permisos para actualizar este usuario'
            });
        }

        if (currentUser.role !== 'admin') {
            delete updates.role;
            delete updates.is_active;
        }

        delete updates.id;
        delete updates.password_hash;
        delete updates.created_at;

        const { data, error } = await supabaseAdmin
            .from('users')
            .update(updates)
            .eq('id', id)
            .select('id, name, last_name, email, phone, position, role, is_active, created_at, last_login');

        if (error) throw error;
        res.json({
            message: 'Usuario actualizado exitosamente',
            user: data[0]
        });
    } catch (error) {
        console.error('Error actualizando usuario:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUser = req.user;

        if (currentUser.id === id) {
            return res.status(400).json({
                error: 'No puedes eliminar tu propia cuenta'
            });
        }

        const { error } = await supabaseAdmin
            .from('users')
            .update({ is_active: false })
            .eq('id', id);

        if (error) throw error;
        res.json({
            message: 'Usuario desactivado exitosamente'
        });
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getUsers,
    createUser,
    updateUser,
    deleteUser
};