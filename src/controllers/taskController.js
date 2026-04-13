const { supabaseAdmin } = require('../config/supabase');
const { createNotificationForAllUsers } = require('./notificationController');
const { v4 } = require('uuid');
const {
    uploadToEvidencesBucket,
    uploadMultipleToEvidencesBucket,
    deleteMultipleFromEvidencesBucket
} = require('../utils/storage');

const attachSubtasksToTasks = async (tasks) => {
    if (!tasks || tasks.length === 0) return tasks;

    const taskIds = tasks.map(t => t.id);
    const { data: subtasks, error } = await supabaseAdmin
        .from('subtasks')
        .select('*')
        .in('task_id', taskIds);

    if (error) {
        console.error('Error obteniendo subtareas:', error);
        return tasks;
    }

    const subtasksByTask = {};
    subtasks.forEach(sub => {
        if (!subtasksByTask[sub.task_id]) subtasksByTask[sub.task_id] = [];
        subtasksByTask[sub.task_id].push(sub);
    });

    return tasks.map(task => ({
        ...task,
        subtasks: subtasksByTask[task.id] || []
    }));
};


const addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { text, user_id, user_name } = req.body;
        let images = [];
        if (req.files && req.files.length > 0) {
            images = await uploadMultipleToEvidencesBucket(req.files);
        }

        if (!text && images.length === 0) {
            return res.status(400).json({ error: 'Se requiere texto o al menos una imagen para el comentario' });
        }

        const { data: task, error: fetchError } = await supabaseAdmin
            .from('tasks')
            .select('*')
            .eq('id', id)
            .single();
        if (fetchError) throw fetchError;

        const reference_id = v4();
        const newComment = {
            id: reference_id,
            text: text || '',
            images: images.length > 0 ? images : null,
            user_id: user_id || null,
            user_name: user_name || 'Anónimo',
            created_at: new Date().toISOString()
        };

        const updatedComments = [...(task.comments || []), newComment];

        const { data, error } = await supabaseAdmin
            .from('tasks')
            .update({ comments: updatedComments })
            .eq('id', id)
            .select(`
                *,
                users:responsible_id (id, name, email)
            `);
        if (error) throw error;

        const notifyData = {
            title: 'Nuevo comentario en tarea',
            message: `${user_name} comentó en la tarea ${task.name}`,
            type: 'comment',
            reference_id: newComment.id,
            project_id: task.project_id,
            module_id: task.module_id,
            task_id: id,
            created_by: user_id,
        };
        await createNotificationForAllUsers(notifyData);

        const taskWithSubtasks = await attachSubtasksToTasks([data[0]]);
        res.json(taskWithSubtasks[0]);
    } catch (error) {
        console.error('Error agregando comentario:', error);
        res.status(500).json({ error: error.message });
    }
};

const editComment = async (req, res) => {
    try {
        const { taskId, commentId } = req.params;
        const { text, user_id, images: providedImages } = req.body;
        let images = providedImages ? (Array.isArray(providedImages) ? providedImages : [providedImages]) : undefined;

        if (req.files && req.files.length > 0) {
            const uploadedUrls = await uploadMultipleToEvidencesBucket(req.files);
            if (images === undefined) {
                images = uploadedUrls;
            } else {
                images = [...images, ...uploadedUrls];
            }
        }

        if (!text && (!images || images.length === 0)) {
            return res.status(400).json({ error: 'Se requiere texto o al menos una imagen para actualizar el comentario' });
        }

        const { data: task, error: fetchError } = await supabaseAdmin
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .single();
        if (fetchError) throw fetchError;
        if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });

        const commentIndex = task.comments?.findIndex(comment => comment.id === commentId);
        if (commentIndex === -1 || commentIndex === undefined) {
            return res.status(404).json({ error: 'Comentario no encontrado' });
        }

        const commentToEdit = task.comments[commentIndex];
        if (commentToEdit.user_id !== user_id) {
            return res.status(403).json({ error: 'No tienes permiso para editar este comentario' });
        }

        const updatedComments = [...task.comments];
        if (text !== undefined) updatedComments[commentIndex].text = text;
        if (images !== undefined) updatedComments[commentIndex].images = images.length > 0 ? images : null;
        updatedComments[commentIndex].edited_at = new Date().toISOString();
        updatedComments[commentIndex].edited_by = user_id;
        updatedComments[commentIndex].is_edited = true;

        const { data: updatedTask, error: updateError } = await supabaseAdmin
            .from('tasks')
            .update({ comments: updatedComments, updated_at: new Date().toISOString() })
            .eq('id', taskId)
            .select(`
                *,
                users:responsible_id (id, name, email)
            `);
        if (updateError) throw updateError;

        const notifyData = {
            title: 'Comentario editado',
            message: `${commentToEdit.user_name} editó su comentario en la tarea ${task.name}`,
            type: 'comment_edit',
            reference_id: commentId,
            project_id: task.project_id,
            module_id: task.module_id,
            task_id: taskId,
            created_by: user_id,
        };
        await createNotificationForAllUsers(notifyData);

        const taskWithSubtasks = await attachSubtasksToTasks([updatedTask[0]]);
        res.status(200).json(taskWithSubtasks[0]);
    } catch (error) {
        console.error('Error editando comentario:', error);
        res.status(500).json({ error: error.message });
    }
};

const uploadTaskImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ninguna imagen' });
        }
        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ image_url: imageUrl });
    } catch (error) {
        console.error('Error subiendo imagen:', error);
        res.status(500).json({ error: error.message });
    }
};

const getTasks = async (req, res) => {
    try {
        const { status, area, responsible_id, project_id, module_id } = req.query;

        let query = supabaseAdmin
            .from('tasks')
            .select(`
                *,
                users:responsible_id (id, name, email, position),
                projects:project_id (id, name, created_by),
                modules:module_id (id, name, project_id)
            `)
            .order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);
        if (area) query = query.eq('area', area);
        if (responsible_id) query = query.eq('responsible_id', responsible_id);
        if (project_id) query = query.eq('project_id', project_id);
        if (module_id) query = query.eq('module_id', module_id);

        const { data, error } = await query;
        if (error) throw error;

        const tasksWithSubtasks = await attachSubtasksToTasks(data || []);
        res.json(tasksWithSubtasks);
    } catch (error) {
        console.error('Error obteniendo tareas:', error);
        res.status(500).json({ error: error.message });
    }
};

const getTasksByProject = async (req, res) => {
    try {
        const { project_id } = req.params;
        const { module_id, status, responsible_id, area } = req.query;
        const currentUser = req.user;

        const { data: project, error: projectError } = await supabaseAdmin
            .from('projects')
            .select('created_by, is_active')
            .eq('id', project_id)
            .single();

        if (projectError || !project?.is_active) {
            return res.status(404).json({ error: 'Proyecto no encontrado o inactivo' });
        }

        let query = supabaseAdmin
            .from('tasks')
            .select(`
                *,
                users:responsible_id (id, name, email),
                modules:module_id (id, name, project_id)
            `)
            .eq('project_id', project_id)
            .order('created_at', { ascending: false });

        if (module_id) query = query.eq('module_id', module_id);
        if (status) query = query.eq('status', status);
        if (responsible_id) query = query.eq('responsible_id', responsible_id);
        if (area) query = query.eq('area', area);

        const { data, error } = await query;
        if (error) throw error;

        const tasksWithSubtasks = await attachSubtasksToTasks(data || []);
        res.json(tasksWithSubtasks);
    } catch (error) {
        console.error('Error obteniendo tareas del proyecto:', error);
        res.status(500).json({ error: error.message });
    }
};

const getTasksWithoutProject = async (req, res) => {
    try {
        const currentUser = req.user;

        let query = supabaseAdmin
            .from('tasks')
            .select(`
                *,
                users:responsible_id (id, name, email, position)
            `)
            .is('project_id', null)
            .order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        const tasksWithSubtasks = await attachSubtasksToTasks(data || []);
        res.json(tasksWithSubtasks);
    } catch (error) {
        console.error('Error obteniendo tareas sin proyecto:', error);
        res.status(500).json({ error: error.message });
    }
};

const createTask = async (req, res) => {
    try {
        let {
            name,
            description,
            estimated_time,
            responsible_id,
            status,
            area,
            project_id,
            module_id,
            priority = 'medium',
            task_images = []
        } = req.body;

        const currentUser = req.user;

        if (typeof task_images === 'string') {
            task_images = [task_images];
        } else if (!Array.isArray(task_images)) {
            task_images = [];
        }

        if (!name) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }

        if (req.files && req.files.length > 0) {
            const uploadedUrls = await uploadMultipleToEvidencesBucket(req.files);
            task_images = [...task_images, ...uploadedUrls];
        }

        if (project_id) {
            const { data: project, error: projectError } = await supabaseAdmin
                .from('projects')
                .select('created_by')
                .eq('id', project_id)
                .eq('is_active', true)
                .single();

            if (projectError) {
                return res.status(404).json({ error: 'Proyecto no encontrado o inactivo' });
            }
        }

        if (module_id) {
            const { data: module, error: moduleError } = await supabaseAdmin
                .from('modules')
                .select('project_id')
                .eq('id', module_id)
                .eq('is_active', true)
                .single();

            if (moduleError) {
                return res.status(404).json({ error: 'Módulo no encontrado o inactivo' });
            }

            if (project_id && module.project_id !== project_id) {
                return res.status(400).json({
                    error: 'El módulo no pertenece al proyecto especificado'
                });
            }

            if (!project_id) {
                project_id = module.project_id;
            }
        }

        const { data, error } = await supabaseAdmin
            .from('tasks')
            .insert([{
                name,
                description: description || null,
                estimated_time: estimated_time ? parseInt(estimated_time) : null,
                responsible_id: responsible_id || null,
                status: status || 'Desarrollo',
                area: area || 'general',
                priority,
                task_images: task_images.length > 0 ? task_images : null,
                project_id: project_id || null,
                module_id: module_id || null,
                comments: [],
                created_by: currentUser.id,
                created_at: new Date().toISOString()
            }])
            .select(`
                *,
                users:responsible_id (id, name, email),
                projects:project_id (id, name),
                modules:module_id (id, name)
            `);

        if (error) throw error;

        const reference_id = v4();
        const notifyData = {
            title: 'Nueva tarea creada',
            message: `${currentUser.name} creó la tarea ${name}`,
            type: 'comment',
            reference_id,
            project_id,
            module_id,
            task_id: data[0].id,
            created_by: currentUser.id,
        };

        await createNotificationForAllUsers(notifyData);

        const taskWithSubtasks = { ...data[0], subtasks: [] };
        res.status(201).json(taskWithSubtasks);
    } catch (error) {
        console.error('Error creando tarea:', error);
        res.status(500).json({ error: error.message });
    }
};

const updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        let updates = { ...req.body };
        const currentUser = req.user;

        const { data: existingTask, error: fetchError } = await supabaseAdmin
            .from('tasks')
            .select('task_images')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        let task_images = existingTask.task_images || [];

        if (updates.task_images !== undefined) {
            if (typeof updates.task_images === 'string') {
                task_images = [updates.task_images];
            } else if (Array.isArray(updates.task_images)) {
                task_images = updates.task_images;
            } else {
                task_images = [];
            }
        }

        if (req.files && req.files.length > 0) {
            const uploadedUrls = await uploadMultipleToEvidencesBucket(req.files);
            task_images = [...task_images, ...uploadedUrls];
        }

        updates.task_images = task_images.length > 0 ? task_images : null;

        if (updates.module_id) {
            const { data: module, error: moduleError } = await supabaseAdmin
                .from('modules')
                .select('project_id')
                .eq('id', updates.module_id)
                .eq('is_active', true)
                .single();

            if (moduleError) {
                return res.status(404).json({ error: 'Módulo no encontrado o inactivo' });
            }
        }

        if (updates.status === 'Terminada' && !updates.finished_at) {
            updates.finished_at = new Date().toISOString();
        }

        const { data, error } = await supabaseAdmin
            .from('tasks')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select(`
                *,
                users:responsible_id (id, name, email),
                projects:project_id (id, name),
                modules:module_id (id, name)
            `);

        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        const reference_id = v4();
        const notifyData = {
            title: 'Tarea actualizada',
            message: `${currentUser.name} actualizó la tarea ${data[0].name}`,
            type: 'comment',
            reference_id,
            project_id: data[0].projects?.id,
            module_id: data[0].modules?.id,
            task_id: data[0].id,
            created_by: currentUser.id,
        };

        await createNotificationForAllUsers(notifyData);

        const taskWithSubtasks = await attachSubtasksToTasks([data[0]]);
        res.json(taskWithSubtasks[0]);
    } catch (error) {
        console.error('Error actualizando tarea:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteTaskImages = async (req, res) => {
    try {
        const { id } = req.params;
        const { imageUrls } = req.body;

        if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
            return res.status(400).json({ error: 'Debe proporcionar URLs de imágenes a eliminar' });
        }

        const { data: existingTask, error: fetchError } = await supabaseAdmin
            .from('tasks')
            .select('task_images')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        const updatedImages = (existingTask.task_images || []).filter(
            imageUrl => !imageUrls.includes(imageUrl)
        );

        await deleteMultipleFromEvidencesBucket(imageUrls);

        const { data, error } = await supabaseAdmin
            .from('tasks')
            .update({
                task_images: updatedImages.length > 0 ? updatedImages : null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select();

        if (error) throw error;

        res.json({
            message: 'Imágenes eliminadas exitosamente',
            remaining_images: updatedImages
        });
    } catch (error) {
        console.error('Error eliminando imágenes:', error);
        res.status(500).json({ error: error.message });
    }
};

const uploadTaskImages = async (req, res) => {
    try {
        const { id } = req.params;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No se subieron imágenes' });
        }

        const uploadedUrls = await uploadMultipleToEvidencesBucket(req.files);

        const { data: existingTask, error: fetchError } = await supabaseAdmin
            .from('tasks')
            .select('task_images')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        const currentImages = existingTask.task_images || [];
        const updatedImages = [...currentImages, ...uploadedUrls];

        const { data, error } = await supabaseAdmin
            .from('tasks')
            .update({
                task_images: updatedImages,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select();

        if (error) throw error;

        res.json({
            message: 'Imágenes subidas exitosamente',
            images: uploadedUrls,
            all_images: updatedImages
        });
    } catch (error) {
        console.error('Error subiendo imágenes:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUser = req.user;

        const { data: existingTask, error: fetchError } = await supabaseAdmin
            .from('tasks')
            .select('task_images')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        if (existingTask?.task_images && existingTask.task_images.length > 0) {
            await deleteMultipleFromEvidencesBucket(existingTask.task_images);
        }

        const { error } = await supabaseAdmin
            .from('tasks')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Tarea eliminada exitosamente' });
    } catch (error) {
        console.error('Error eliminando tarea:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getTasks,
    createTask,
    updateTask,
    addComment,
    editComment,
    deleteTask,
    uploadTaskImage,
    getTasksWithoutProject,
    getTasksByProject,
    deleteTaskImages,
    uploadTaskImages,
};