import { Router, Request, Response } from "express";
import { internalAuth } from "../middleware/internalAuth";
import { sessionManager } from "../services/sessionManager";
import { documentManager } from "../services/documentManager";
import { pineconeClient } from "../services/pineconeClient";
import { getSupabaseClient } from "../config/supabase";
import logger from "../utils/logger";

const router = Router();
const supabase = getSupabaseClient();

router.use(internalAuth);

/**
 * POST /api/internal/cleanup-sessions
 * Deletes expired user_sessions. Call from cron every 5–15 min.
 * Requires: Authorization: Bearer <INTERNAL_API_KEY> or X-Internal-API-Key: <INTERNAL_API_KEY>
 */
router.post("/cleanup-sessions", async (_req: Request, res: Response) => {
  try {
    const deletedCount = await sessionManager.cleanupExpiredSessions();
    logger.info("cleanup_sessions_completed", { deleted_count: deletedCount });
    res.status(200).json({
      success: true,
      deleted_count: deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("cleanup_sessions_error", { error: error.message });
    res.status(500).json({
      success: false,
      error: "CleanupFailed",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/internal/cleanup-sessions
 * Same as POST, for cron services that only support GET.
 */
router.get("/cleanup-sessions", async (_req: Request, res: Response) => {
  try {
    const deletedCount = await sessionManager.cleanupExpiredSessions();
    logger.info("cleanup_sessions_completed", { deleted_count: deletedCount });
    res.status(200).json({
      success: true,
      deleted_count: deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("cleanup_sessions_error", { error: error.message });
    res.status(500).json({
      success: false,
      error: "CleanupFailed",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/internal/documents
 * List all documents (for admin/demo purposes)
 */
router.get("/documents", async (_req: Request, res: Response) => {
  try {
    const documents = await documentManager.listDocuments({ limit: 100 });
    
    res.status(200).json({
      success: true,
      documents,
      count: documents.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("internal_list_documents_error", { error: error.message });
    res.status(500).json({
      success: false,
      error: "ListFailed",
      message: error.message,
    });
  }
});

/**
 * POST /api/internal/documents/ingest
 * Ingest a document (for demo purposes)
 */
router.post("/documents/ingest", async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, content, program, category } = req.body;

    if (!title || !content) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: title and content",
      });
      return;
    }

    const documentId = await documentManager.ingestDocument({
      title,
      content,
      program: program || 'general',
      category: category || 'kb_article',
      metadata: {
        created_via: 'internal_api',
        demo: true,
      },
    });

    logger.info("internal_document_ingested", { documentId, title });

    res.status(201).json({
      success: true,
      documentId,
      message: 'Document ingested successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("internal_ingest_error", { error: error.message });
    res.status(500).json({
      success: false,
      error: "IngestFailed",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/internal/documents/:id
 * Delete a document (for demo purposes)
 */
router.delete("/documents/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Get document info before deletion
    const doc = await documentManager.getDocument(id);
    
    if (!doc) {
      res.status(404).json({
        success: false,
        error: "Document not found",
      });
      return;
    }

    // Get stats before deletion
    const statsBefore = await pineconeClient.getStats();

    // Delete
    await documentManager.deleteDocument(id, 'internal_api', 'Demo/admin deletion');

    // Get stats after deletion
    const statsAfter = await pineconeClient.getStats();

    logger.info("internal_document_deleted", { documentId: id, title: doc.title });

    res.status(200).json({
      success: true,
      documentId: id,
      title: doc.title,
      deletion_summary: {
        supabase: 'Soft deleted',
        pinecone_vectors_before: statsBefore.totalRecordCount,
        pinecone_vectors_after: statsAfter.totalRecordCount,
        vectors_deleted: statsBefore.totalRecordCount - statsAfter.totalRecordCount,
        s3_file: doc.metadata?.s3_key ? 'Deleted' : 'N/A',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("internal_delete_error", { error: error.message });
    res.status(500).json({
      success: false,
      error: "DeleteFailed",
      message: error.message,
    });
  }
});

/**
 * GET /api/internal/documents/stats
 * Get document statistics across all systems
 */
router.get("/documents/stats", async (_req: Request, res: Response) => {
  try {
    // Supabase stats
    const { count: totalDocs } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('content_type', 'kb_article')
      .is('deleted_at', null);

    const { count: deletedDocs } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('content_type', 'kb_article')
      .not('deleted_at', 'is', null);

    // Pinecone stats
    const pineconeStats = await pineconeClient.getStats();

    res.status(200).json({
      success: true,
      stats: {
        supabase: {
          active_documents: totalDocs || 0,
          deleted_documents: deletedDocs || 0,
          total: (totalDocs || 0) + (deletedDocs || 0),
        },
        pinecone: {
          total_vectors: pineconeStats.totalRecordCount,
          dimension: pineconeStats.dimension,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("internal_stats_error", { error: error.message });
    res.status(500).json({
      success: false,
      error: "StatsFailed",
      message: error.message,
    });
  }
});

export default router;
