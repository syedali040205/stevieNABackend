import express from 'express';
import multer from 'multer';
import { documentManager } from '../services/documentManager';
import { validateJWT } from '../middleware/auth';
import { extractTextFromFile, validateFileSize, validateFileType } from '../utils/fileExtractor';
import logger from '../utils/logger';

const router = express.Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

/**
 * POST /api/documents/upload
 * Upload a document file (PDF, DOCX, TXT)
 */
router.post('/upload', validateJWT, upload.single('file'), async (req, res) => {
  try {
    const { title, program, category } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: 'No file uploaded',
      });
    }

    if (!title) {
      return res.status(400).json({
        error: 'Missing required field: title',
      });
    }

    // Validate file
    validateFileSize(file.size);
    validateFileType(file.mimetype, file.originalname);

    // Extract text from file
    const content = await extractTextFromFile(
      file.buffer,
      file.mimetype,
      file.originalname
    );

    // Ingest document with file
    const documentId = await documentManager.ingestDocument({
      title,
      content,
      program,
      category,
      file: {
        buffer: file.buffer,
        contentType: file.mimetype,
        originalFilename: file.originalname,
      },
    });

    return res.status(201).json({
      success: true,
      documentId,
      message: 'Document uploaded and ingested successfully',
      extractedTextLength: content.length,
    });
  } catch (error: any) {
    logger.error('document_upload_route_error', { error: error.message });
    return res.status(500).json({
      error: 'Failed to upload document',
      details: error.message,
    });
  }
});

/**
 * POST /api/documents/ingest
 * Ingest a new document
 */
router.post('/ingest', validateJWT, async (req, res) => {
  try {
    const { title, content, program, category, metadata } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        error: 'Missing required fields: title and content are required',
      });
    }

    const documentId = await documentManager.ingestDocument({
      title,
      content,
      program,
      category,
      metadata,
    });

    return res.status(201).json({
      success: true,
      documentId,
      message: 'Document ingested successfully',
    });
  } catch (error: any) {
    logger.error('document_ingest_route_error', { error: error.message });
    return res.status(500).json({
      error: 'Failed to ingest document',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete('/:id', validateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    await documentManager.deleteDocument(id);

    return res.status(200).json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error: any) {
    logger.error('document_delete_route_error', { error: error.message });
    return res.status(500).json({
      error: 'Failed to delete document',
      details: error.message,
    });
  }
});

/**
 * POST /api/documents/search
 * Search documents
 */
router.post('/search', async (req, res) => {
  try {
    const { query, topK, program, category } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Missing required field: query',
      });
    }

    const results = await documentManager.searchDocuments({
      query,
      topK: topK || 5,
      program,
      category,
    });

    return res.status(200).json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error: any) {
    logger.error('document_search_route_error', { error: error.message });
    return res.status(500).json({
      error: 'Failed to search documents',
      details: error.message,
    });
  }
});

/**
 * GET /api/documents/:id
 * Get a document by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const document = await documentManager.getDocument(id);

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }

    return res.status(200).json({
      success: true,
      document,
    });
  } catch (error: any) {
    logger.error('document_get_route_error', { error: error.message });
    return res.status(500).json({
      error: 'Failed to get document',
      details: error.message,
    });
  }
});

/**
 * GET /api/documents
 * List all documents
 */
router.get('/', async (req, res) => {
  try {
    const { program, category, limit, offset } = req.query;

    const documents = await documentManager.listDocuments({
      program: program as string,
      category: category as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.status(200).json({
      success: true,
      documents,
      count: documents.length,
    });
  } catch (error: any) {
    logger.error('document_list_route_error', { error: error.message });
    res.status(500).json({
      error: 'Failed to list documents',
      details: error.message,
    });
  }
});

/**
 * GET /api/documents/:id/download
 * Get presigned URL for document download
 */
router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;

    const downloadUrl = await documentManager.getDocumentDownloadUrl(id);

    if (!downloadUrl) {
      return res.status(404).json({
        error: 'Document file not available for download',
      });
    }

    return res.status(200).json({
      success: true,
      downloadUrl,
      expiresIn: 604800, // 7 days in seconds
    });
  } catch (error: any) {
    logger.error('document_download_route_error', { error: error.message });
    return res.status(500).json({
      error: 'Failed to generate download URL',
      details: error.message,
    });
  }
});

export default router;
