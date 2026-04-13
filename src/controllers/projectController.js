const { supabaseAdmin } = require('../config/supabase');

const getProjects = async (req, res) => {
    try {
        const { is_active, user_id } = req.query;
        const currentUser = req.user;

        let query = supabaseAdmin
            .from('projects')
            .select(`
                *,
                created_by_user:users!projects_created_by_fkey(id, name, email),
                tasks:tasks(id, name, status, responsible_id, created_at),
                task_count:tasks(count)
            `)
            .order('created_at', { ascending: false });
        if (is_active !== undefined) {
            query = query.eq('is_active', is_active === 'true');
        }
        if (user_id) {
            query = query.eq('created_by', user_id);
        }

        const { data, error } = await query;

        if (error) throw error;

        const formattedProjects = data.map(project => ({
            ...project,
            task_count: project.task_count[0]?.count || 0
        }));

        res.json(formattedProjects);
    } catch (error) {
        console.error('Error obteniendo proyectos:', error);
        res.status(500).json({ error: error.message });
    }
};

const getProjectById = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUser = req.user;

        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select(`
                *,
                created_by_user:users!projects_created_by_fkey(id, name, email, position)
            `)
            .eq('id', id)
            .single();

        if (projectError) throw projectError;

        const { data: tasks, error: tasksError } = await supabaseAdmin
            .from('tasks')
            .select(`
                *,
                users:responsible_id(id, name, email, position),
                subtasks (*)
            `)
            .eq('project_id', id)
            .order('created_at', { ascending: false });

        if (tasksError) throw tasksError;

        const tasksWithSubtasks = tasks.map(task => ({
            ...task,
            subtasks: task.subtasks || []
        }));

        res.json({
            ...project,
            tasks: tasksWithSubtasks
        });
    } catch (error) {
        console.error('Error obteniendo proyecto:', error);
        res.status(500).json({ error: error.message });
    }
};
const createProject = async (req, res) => {
    try {
        const { name, description } = req.body;
        const currentUser = req.user;

        if (!name) {
            return res.status(400).json({ error: 'El nombre del proyecto es requerido' });
        }

        const { data, error } = await supabaseAdmin
            .from('projects')
            .insert([{
                name,
                description: description || null,
                created_by: currentUser.id,
                is_active: true
            }])
            .select(`
                *,
                created_by_user:users!projects_created_by_fkey(id, name, email)
            `);

        if (error) throw error;

        res.status(201).json({
            message: 'Proyecto creado exitosamente',
            project: data[0]
        });
    } catch (error) {
        console.error('Error creando proyecto:', error);
        res.status(500).json({ error: error.message });
    }
};

const updateProject = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const currentUser = req.user;

        const { data: existingProject, error: fetchError } = await supabaseAdmin
            .from('projects')
            .select('created_by')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        delete updates.id;
        delete updates.created_by;
        delete updates.created_at;

        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabaseAdmin
            .from('projects')
            .update(updates)
            .eq('id', id)
            .select(`
                *,
                created_by_user:users!projects_created_by_fkey(id, name, email)
            `);

        if (error) throw error;

        res.json({
            message: 'Proyecto actualizado exitosamente',
            project: data[0]
        });
    } catch (error) {
        console.error('Error actualizando proyecto:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteProject = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUser = req.user;
        const { hard_delete = false } = req.body;

        const { data: existingProject, error: fetchError } = await supabaseAdmin
            .from('projects')
            .select('created_by')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        if (hard_delete === true && currentUser.role === 'admin') {
            const { error } = await supabaseAdmin
                .from('projects')
                .delete()
                .eq('id', id);

            if (error) throw error;

            res.json({ message: 'Proyecto eliminado permanentemente' });
        } else {
            const { error } = await supabaseAdmin
                .from('projects')
                .update({
                    is_active: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (error) throw error;

            res.json({ message: 'Proyecto desactivado exitosamente' });
        }
    } catch (error) {
        console.error('Error eliminando proyecto:', error);
        res.status(500).json({ error: error.message });
    }
};

const getProjectStats = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('created_by')
            .eq('id', id)
            .single();

        if (projectError) throw projectError;

        const { data: stats, error: statsError } = await supabaseAdmin
            .from('tasks')
            .select('status')
            .eq('project_id', id);

        if (statsError) throw statsError;

        const totalTasks = stats.length;
        const statusCount = stats.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
        }, {});

        const { data: timeStats, error: timeError } = await supabaseAdmin
            .from('tasks')
            .select('estimated_time')
            .eq('project_id', id);

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
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject,
    getProjectStats
};