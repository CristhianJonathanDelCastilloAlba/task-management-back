const { supabaseAdmin } = require('../config/supabase');

const createNotificationForAllUsers = async (notificationData) => {
    try {
        const { data: activeUsers, error: usersError } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('is_active', true);

        if (usersError) throw usersError;

        if (!activeUsers || activeUsers.length === 0) {
            console.log('No hay usuarios activos para notificar');
            return;
        }

        const notifications = activeUsers
            .filter(user => user.id !== notificationData.created_by)
            .map(user => ({
                user_id: user.id,
                title: notificationData.title,
                message: notificationData.message,
                type: notificationData.type,
                reference_id: notificationData.reference_id,
                project_id: notificationData.project_id || null,
                module_id: notificationData.module_id || null,
                task_id: notificationData.task_id || null,
                created_by: notificationData.created_by || null,
                is_read: false
            }));

        if (notifications.length === 0) {
            console.log('Nadie para notificar (solo estaba el creador)');
            return;
        }

        const { error: insertError } = await supabaseAdmin
            .from('notifications')
            .insert(notifications);

        if (insertError) {
            console.error('Error creando notificaciones:', insertError);
            return;
        }

        console.log(`Notificaciones creadas para ${notifications.length} usuarios`);
    } catch (error) {
        console.error('Error en createNotificationForAllUsers:', error);
    }
};


const getMyNotifications = async (req, res) => {
    try {
        const currentUser = req.user;
        const { is_read, type, limit = 50, offset = 0 } = req.query;

        let query = supabaseAdmin
            .from('notifications')
            .select(`
                *,
                creator:created_by (id, name),
                project:project_id (id, name),
                module:module_id (id, name),
                task:task_id (id, name)
            `)
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + parseInt(limit) - 1);

        if (is_read !== undefined) {
            query = query.eq('is_read', is_read === 'true');
        }

        if (type) {
            query = query.eq('type', type);
        }

        const { data, error } = await query;

        if (error) throw error;

        const { count: unreadCount, error: countError } = await supabaseAdmin
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id)
            .eq('is_read', false);

        if (countError) {
            console.error('Error contando notificaciones:', countError);
        }

        res.json({
            notifications: data || [],
            unread_count: unreadCount || 0,
            total: data ? data.length : 0
        });
    } catch (error) {
        console.error('Error obteniendo notificaciones:', error);
        res.status(500).json({ error: error.message });
    }
};

const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUser = req.user;

        const { data: notification, error: fetchError } = await supabaseAdmin
            .from('notifications')
            .select('user_id')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        if (notification.user_id !== currentUser.id) {
            return res.status(403).json({
                error: 'No tienes permisos para marcar esta notificación como leída'
            });
        }

        const { data, error } = await supabaseAdmin
            .from('notifications')
            .update({
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq('id', id)
            .select('*')
            .single();

        if (error) throw error;

        res.json({
            message: 'Notificación marcada como leída',
            notification: data
        });
    } catch (error) {
        console.error('Error marcando notificación como leída:', error);
        res.status(500).json({ error: error.message });
    }
};

const markAllAsRead = async (req, res) => {
    try {
        const currentUser = req.user;

        const { error } = await supabaseAdmin
            .from('notifications')
            .update({
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq('user_id', currentUser.id)
            .eq('is_read', false);

        if (error) throw error;

        res.json({ message: 'Todas las notificaciones marcadas como leídas' });
    } catch (error) {
        console.error('Error marcando todas las notificaciones como leídas:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUser = req.user;

        const { data: notification, error: fetchError } = await supabaseAdmin
            .from('notifications')
            .select('user_id')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        if (notification.user_id !== currentUser.id) {
            return res.status(403).json({
                error: 'No tienes permisos para eliminar esta notificación'
            });
        }

        const { error } = await supabaseAdmin
            .from('notifications')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'Notificación eliminada exitosamente' });
    } catch (error) {
        console.error('Error eliminando notificación:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteAllRead = async (req, res) => {
    try {
        const currentUser = req.user;

        const { error } = await supabaseAdmin
            .from('notifications')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('is_read', true);

        if (error) throw error;

        res.json({ message: 'Todas las notificaciones leídas eliminadas' });
    } catch (error) {
        console.error('Error eliminando notificaciones leídas:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    createNotificationForAllUsers,
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllRead
};