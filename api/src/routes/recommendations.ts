import { Router, Request, Response } from 'express';
import { recommendationEngine } from '../services/recommendationEngine';
import { internalAuth } from '../middleware/internalAuth';
import logger from '../utils/logger';

const router = Router();

/**
 * Get category recommendations based on user context
 * POST /api/recommendations
 * 
 * Body:
 * - nomination_subject: string (required) - 'organization', 'product', 'individual', 'team'
 * - description: string (optional) - Achievement description
 * - achievement_focus: string[] (optional) - Focus areas
 * - org_type: string (optional) - Organization type
 * - org_size: string (optional) - Organization size
 * - geography: string (optional) - Geographic region
 */
router.post('/', internalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      nomination_subject,
      description,
      achievement_focus,
      org_type,
      org_size,
      geography,
    } = req.body;

    // Validate required fields
    if (!nomination_subject) {
      res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'nomination_subject is required',
      });
      return;
    }

    logger.info('recommendation_request', {
      nomination_subject,
      has_description: !!description,
      focus_count: achievement_focus?.length || 0,
      org_type,
      geography,
    });

    // Get recommendations
    const recommendations = await recommendationEngine.generateRecommendations({
      nomination_subject,
      description,
      achievement_focus,
      org_type,
      org_size,
      geography,
    });

    logger.info('recommendations_generated', {
      count: recommendations.length,
      top_score: recommendations[0]?.similarity_score || 0,
    });

    res.json({
      success: true,
      recommendations,
      count: recommendations.length,
    });
  } catch (error: any) {
    logger.error('recommendation_error', {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: 'InternalServerError',
      message: 'Failed to generate recommendations',
    });
  }
});

export default router;
