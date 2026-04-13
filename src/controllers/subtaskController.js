const { supabaseAdmin } = require('../config/supabase');
const { v4 } = require('uuid');
const { createNotificationForAllUsers } = require('./notificationController');
const { uploadMultipleToEvidencesBucket, deleteMultipleFromEvidencesBucket } = require('../utils/storage');

const getSubtasksByTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { data, error } = await supabaseAdmin
            .from('subtasks')
            .select('*')
            .eq('task_id', taskId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Error obteniendo subtareas:', error);
        res.status(500).json({ error: error.message });
    }
};

const createSubtask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { text, priority = 'medium' } = req.body;
        const currentUser = req.user;

        if (!text) {
            return res.status(400).json({ error: 'El texto de la subtarea es requerido' });
        }

        const { data: task, error: taskError } = await supabaseAdmin
            .from('tasks')
            .select('name, project_id, module_id')
            .eq('id', taskId)
            .single();
        if (taskError || !task) {
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        let images = [];
        if (req.files && req.files.length > 0) {
            images = await uploadMultipleToEvidencesBucket(req.files);
        }

        const newSubtask = {
            id: v4(),
            task_id: taskId,
            text,
            completed: false,
            priority,
            images: images.length > 0 ? images : null,
            created_by: currentUser.id,
            created_at: new Date().toISOString()
        };

        const { data, error } = await supabaseAdmin
            .from('subtasks')
            .insert([newSubtask])
            .select()
            .single();
        if (error) throw error;

        const notifyData = {
            title: 'Nueva subtarea',
            message: `${currentUser.name} agregó una subtarea a "${task.name}"`,
            type: 'subtask',
            reference_id: data.id,
            project_id: task.project_id,
            module_id: task.module_id,
            task_id: taskId,
            created_by: currentUser.id,
        };
        await createNotificationForAllUsers(notifyData);

        res.status(201).json(data);
    } catch (error) {
        console.error('Error creando subtarea:', error);
        res.status(500).json({ error: error.message });
    }
};

const updateSubtask = async (req, res) => {
    try {
        const { subtaskId } = req.params;
        const updates = req.body;
        const currentUser = req.user;

        const { data: existingSubtask, error: fetchError } = await supabaseAdmin
            .from('subtasks')
            .select('images')
            .eq('id', subtaskId)
            .single();
        if (fetchError || !existingSubtask) {
            return res.status(404).json({ error: 'Subtarea no encontrada' });
        }

        let images = existingSubtask.images || [];

        if (updates.images && typeof updates.images === 'string') {
            try {
                updates.images = JSON.parse(updates.images);
            } catch (e) {
            }
        }

        if (updates.images !== undefined) {
            images = Array.isArray(updates.images) ? updates.images : [updates.images];
        }

        if (req.files && req.files.length > 0) {
            const uploadedUrls = await uploadMultipleToEvidencesBucket(req.files);
            images = [...images, ...uploadedUrls];
        }

        const allowedUpdates = ['text', 'completed', 'priority'];
        const filteredUpdates = {};
        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                filteredUpdates[key] = updates[key];
            }
        });
        filteredUpdates.images = images.length > 0 ? images : null;

        if (Object.keys(filteredUpdates).length === 0) {
            return res.status(400).json({ error: 'No hay campos válidos para actualizar' });
        }

        const { data: subtaskWithTask, error: taskError } = await supabaseAdmin
            .from('subtasks')
            .select('*, tasks!inner(name, project_id, module_id)')
            .eq('id', subtaskId)
            .single();
        if (taskError || !subtaskWithTask) {
            return res.status(404).json({ error: 'Subtarea no encontrada' });
        }

        const { data, error } = await supabaseAdmin
            .from('subtasks')
            .update({ ...filteredUpdates, updated_at: new Date().toISOString() })
            .eq('id', subtaskId)
            .select()
            .single();
        if (error) throw error;

        if (filteredUpdates.completed !== undefined) {
            const action = filteredUpdates.completed ? 'completó' : 'marcó como pendiente';
            const notifyData = {
                title: 'Subtarea actualizada',
                message: `${currentUser.name} ${action} una subtarea`,
                type: 'subtask_update',
                reference_id: data.id,
                project_id: subtaskWithTask.tasks.project_id,
                module_id: subtaskWithTask.tasks.module_id,
                task_id: subtaskWithTask.task_id,
                created_by: currentUser.id,
            };
            await createNotificationForAllUsers(notifyData);
        }

        res.json(data);
    } catch (error) {
        console.error('Error actualizando subtarea:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteSubtask = async (req, res) => {
    try {
        const { subtaskId } = req.params;
        const { data: subtask, error: fetchError } = await supabaseAdmin
            .from('subtasks')
            .select('images')
            .eq('id', subtaskId)
            .single();
        if (!fetchError && subtask?.images && subtask.images.length > 0) {
            await deleteMultipleFromEvidencesBucket(subtask.images);
        }
        const { error } = await supabaseAdmin
            .from('subtasks')
            .delete()
            .eq('id', subtaskId);
        if (error) throw error;
        res.json({ message: 'Subtarea eliminada correctamente' });
    } catch (error) {
        console.error('Error eliminando subtarea:', error);
        res.status(500).json({ error: error.message });
    }
};

const uploadSubtaskImages = async (req, res) => {
    try {
        const { subtaskId } = req.params;
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No se subieron imágenes' });
        }
        const uploadedUrls = await uploadMultipleToEvidencesBucket(req.files);
        const { data: existingSubtask, error: fetchError } = await supabaseAdmin
            .from('subtasks')
            .select('images')
            .eq('id', subtaskId)
            .single();
        if (fetchError) throw fetchError;
        const currentImages = existingSubtask.images || [];
        const updatedImages = [...currentImages, ...uploadedUrls];
        const { data, error } = await supabaseAdmin
            .from('subtasks')
            .update({ images: updatedImages, updated_at: new Date().toISOString() })
            .eq('id', subtaskId)
            .select();
        if (error) throw error;
        res.json({ message: 'Imágenes subidas exitosamente', images: uploadedUrls, all_images: updatedImages });
    } catch (error) {
        console.error('Error subiendo imágenes a subtarea:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteSubtaskImages = async (req, res) => {
    try {
        const { subtaskId } = req.params;
        const { imageUrls } = req.body;
        if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
            return res.status(400).json({ error: 'Debe proporcionar URLs de imágenes a eliminar' });
        }
        const { data: existingSubtask, error: fetchError } = await supabaseAdmin
            .from('subtasks')
            .select('images')
            .eq('id', subtaskId)
            .single();
        if (fetchError) throw fetchError;
        const updatedImages = (existingSubtask.images || []).filter(img => !imageUrls.includes(img));
        await deleteMultipleFromEvidencesBucket(imageUrls);
        const { data, error } = await supabaseAdmin
            .from('subtasks')
            .update({ images: updatedImages.length > 0 ? updatedImages : null, updated_at: new Date().toISOString() })
            .eq('id', subtaskId)
            .select();
        if (error) throw error;
        res.json({ message: 'Imágenes eliminadas exitosamente', remaining_images: updatedImages });
    } catch (error) {
        console.error('Error eliminando imágenes de subtarea:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getSubtasksByTask,
    createSubtask,
    updateSubtask,
    deleteSubtask,
    uploadSubtaskImages,
    deleteSubtaskImages
};