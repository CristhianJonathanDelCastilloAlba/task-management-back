const { supabaseAdmin } = require('../config/supabase');
const uploadMultipleToEvidencesBucket = async (files) => {
    try {
        const uploadedUrls = [];

        for (const file of files) {
            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(2, 15);
            const uniqueFileName = `${timestamp}_${randomString}_${file.originalname.replace(/\s+/g, '_')}`;
            const filePath = `task-images/${uniqueFileName}`;

            const { data, error } = await supabaseAdmin.storage
                .from('evidences')
                .upload(filePath, file.buffer, {
                    contentType: file.mimetype,
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) {
                console.error('Error uploading to storage:', error);
                throw new Error(`Error al subir imagen ${file.originalname}: ${error.message}`);
            }

            const { data: { publicUrl } } = supabaseAdmin.storage
                .from('evidences')
                .getPublicUrl(data.path);

            uploadedUrls.push(publicUrl);
        }

        return uploadedUrls;
    } catch (error) {
        console.error('Error in uploadMultipleToEvidencesBucket:', error);
        throw error;
    }
};

const uploadToEvidencesBucket = async (fileBuffer, fileName, mimeType) => {
    const files = [{
        buffer: fileBuffer,
        originalname: fileName,
        mimetype: mimeType
    }];

    const urls = await uploadMultipleToEvidencesBucket(files);
    return { url: urls[0] };
};

const deleteMultipleFromEvidencesBucket = async (urls) => {
    try {
        if (!urls || urls.length === 0) return;

        const paths = urls.map(url => {
            const urlParts = url.split('/');
            const bucketIndex = urlParts.indexOf('evidences');
            if (bucketIndex > -1) {
                return urlParts.slice(bucketIndex + 1).join('/');
            }
            return null;
        }).filter(path => path !== null);

        if (paths.length > 0) {
            const { error } = await supabaseAdmin.storage
                .from('evidences')
                .remove(paths);

            if (error) {
                console.error('Error deleting from storage:', error);
            }
        }
    } catch (error) {
        console.error('Error in deleteMultipleFromEvidencesBucket:', error);
    }
};

module.exports = {
    uploadToEvidencesBucket,
    uploadMultipleToEvidencesBucket,
    deleteMultipleFromEvidencesBucket
};