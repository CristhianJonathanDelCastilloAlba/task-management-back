const { supabaseAdmin } = require('../config/supabase');

const getModules = async (req, res) => {
    try {
        const { project_id, is_active, user_id } = req.query;

        let query = supabaseAdmin
            .from('modules')
            .select(`
                *,
                projects:project_id (id, name, created_by),
                created_by_user:users!modules_created_by_fkey(id, name, email),
                task_count:tasks(count)
            `)
            .order('order_index', { ascending: true })
            .order('created_at', { ascending: false });

        if (project_id) {
            query = query.eq('project_id', project_id);
        }
        if (is_active !== undefined) {
            query = query.eq('is_active', is_active === 'true');
        }
        if (user_id) {
            query = query.eq('created_by', user_id);
        }

        const { data, error } = await query;

        if (error) throw error;

        const formattedModules = data.map(module => ({
            ...module,
            task_count: module.task_count[0]?.count || 0
        }));

        res.json(formattedModules);
    } catch (error) {
        console.error('Error obteniendo módulos:', error);
        res.status(500).json({ error: error.message });
    }
};

const getModuleById = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: module, error: moduleError } = await supabaseAdmin
            .from('modules')
            .select(`
                *,
                projects:project_id (id, name, created_by),
                created_by_user:users!modules_created_by_fkey(id, name, email, position)
            `)
            .eq('id', id)
            .single();

        if (moduleError) throw moduleError;

        const { data: tasks, error: tasksError } = await supabaseAdmin
            .from('tasks')
            .select(`
                *,
                users:responsible_id(id, name, email, position)
            `)
            .eq('module_id', id)
            .order('created_at', { ascending: false });

        if (tasksError) throw tasksError;

        res.json({
            ...module,
            tasks: tasks || []
        });
    } catch (error) {
        console.error('Error obteniendo módulo:', error);
        res.status(500).json({ error: error.message });
    }
};

const createModule = async (req, res) => {
    try {
        const { name, description, project_id, order_index } = req.body;
        const currentUser = req.user;

        if (!name || !project_id) {
            return res.status(400).json({
                error: 'El nombre y el proyecto son requeridos'
            });
        }

        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('created_by')
            .eq('id', project_id)
            .eq('is_active', true)
            .single();

        if (projectError) {
            return res.status(404).json({
                error: 'Proyecto no encontrado o inactivo'
            });
        }

        const { data, error } = await supabaseAdmin
            .from('modules')
            .insert([{
                name,
                description: description || null,
                project_id,
                order_index: order_index || 0,
                created_by: currentUser.id,
                is_active: true
            }])
            .select(`
                *,
                projects:project_id (id, name),
                created_by_user:users!modules_created_by_fkey(id, name, email)
            `);

        if (error) throw error;

        res.status(201).json({
            message: 'Módulo creado exitosamente',
            module: data[0]
        });
    } catch (error) {
        console.error('Error creando módulo:', error);
        res.status(500).json({ error: error.message });
    }
};

const updateModule = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const { data: existingModule, error: fetchError } = await supabaseAdmin
            .from('modules')
            .select('project_id, created_by')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('created_by')
            .eq('id', existingModule.project_id)
            .single();

        if (projectError) throw projectError;

        delete updates.id;
        delete updates.project_id;
        delete updates.created_by;
        delete updates.created_at;

        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin
            .from('modules')
            .update(updates)
            .eq('id', id)
            .select(`
                *,
                projects:project_id (id, name),
                created_by_user:users!modules_created_by_fkey(id, name, email)
            `);

        if (error) throw error;

        res.json({
            message: 'Módulo actualizado exitosamente',
            module: data[0]
        });
    } catch (error) {
        console.error('Error actualizando módulo:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteModule = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUser = req.user;
        const { hard_delete = false } = req.body;

        const { data: existingModule, error: fetchError } = await supabaseAdmin
            .from('modules')
            .select('project_id, created_by')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('created_by')
            .eq('id', existingModule.project_id)
            .single();

        if (projectError) throw projectError;

        if (hard_delete === true && currentUser.role === 'admin') {
            const { error } = await supabaseAdmin
                .from('modules')
                .delete()
                .eq('id', id);

            if (error) throw error;

            res.json({ message: 'Módulo eliminado permanentemente' });
        } else {
            const { error } = await supabaseAdmin
                .from('modules')
                .update({
                    is_active: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (error) throw error;

            res.json({ message: 'Módulo desactivado exitosamente' });
        }
    } catch (error) {
        console.error('Error eliminando módulo:', error);
        res.status(500).json({ error: error.message });
    }
};

const getModuleStats = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: module, error: moduleError } = await supabaseAdmin
            .from('modules')
            .select('project_id')
            .eq('id', id)
            .single();

        if (moduleError) throw moduleError;

        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('created_by')
            .eq('id', module.project_id)
            .single();

        if (projectError) throw projectError;

        const { data: stats, error: statsError } = await supabaseAdmin
            .from('tasks')
            .select('status')
            .eq('module_id', id);

        if (statsError) throw statsError;

        const totalTasks = stats.length;
        const statusCount = stats.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
        }, {});

        const { data: timeStats, error: timeError } = await supabaseAdmin
            .from('tasks')
            .select('estimated_time')
            .eq('module_id', id);

        if (timeError) throw timeError;

        const totalEstimatedTime = timeStats.reduce((sum, task) => {
            return sum + (task.estimated_time || 0);
        }, 0);

        res.json({
            total_tasks: totalTasks,
            status_distribution: statusCount,
            total_estimated_time: totalEstimatedTime,
            completion_rate: totalTasks > 0
                ? ((statusCount['Production'] || 0) / totalTasks * 100).toFixed(2)
                : 0
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas del módulo:', error);
        res.status(500).json({ error: error.message });
    }
};

const reorderModules = async (req, res) => {
    try {
        const { project_id } = req.params;
        const { modules } = req.body;

        if (!Array.isArray(modules)) {
            return res.status(400).json({
                error: 'Se requiere un array de módulos para reordenar'
            });
        }

        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('created_by')
            .eq('id', project_id)
            .single();

        if (projectError) throw projectError;

        const updatePromises = modules.map(module =>
            supabaseAdmin
                .from('modules')
                .update({
                    order_index: module.order_index,
                    updated_at: new Date().toISOString()
                })
                .eq('id', module.id)
                .eq('project_id', project_id)
        );

        await Promise.all(updatePromises);

        res.json({
            message: 'Módulos reordenados exitosamente'
        });
    } catch (error) {
        console.error('Error reordenando módulos:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getModules,
    getModuleById,
    createModule,
    updateModule,
    deleteModule,
    getModuleStats,
    reorderModules
};