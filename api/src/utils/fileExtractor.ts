import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import logger from './logger';

/**
 * File Text Extractor
 * 
 * Extracts plain text from various file formats (PDF, DOCX, TXT).
 */

/**
 * Extract text from a file buffer based on content type
 */
export async function extractTextFromFile(
  fileBuffer: Buffer,
  contentType: string,
  filename: string
): Promise<string> {
  try {
    // Determine extraction method based on content type
    if (contentType === 'application/pdf' || filename.endsWith('.pdf')) {
      return await extractTextFromPDF(fileBuffer);
    } else if (
      contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      filename.endsWith('.docx')
    ) {
      return await extractTextFromDOCX(fileBuffer);
    } else if (contentType === 'text/plain' || filename.endsWith('.txt')) {
      return fileBuffer.toString('utf-8');
    } else {
      throw new Error(`Unsupported file type: ${contentType}`);
    }
  } catch (error: any) {
    logger.error('file_extraction_error', {
      contentType,
      filename,
      error: error.message,
    });
    throw new Error(`Failed to extract text from file: ${error.message}`);
  }
}

/**
 * Extract text from PDF
 */
async function extractTextFromPDF(fileBuffer: Buffer): Promise<string> {
  try {
    // @ts-ignore - pdf-parse has incorrect type definitions
    const data = await pdfParse(fileBuffer);
    const text = data.text.trim();

    if (!text || text.length === 0) {
      throw new Error('PDF contains no extractable text');
    }

    logger.info('pdf_text_extracted', {
      pages: data.numpages,
      textLength: text.length,
    });

    return text;
  } catch (error: any) {
    logger.error('pdf_extraction_error', { error: error.message });
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

/**
 * Extract text from DOCX
 */
async function extractTextFromDOCX(fileBuffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    const text = result.value.trim();

    if (!text || text.length === 0) {
      throw new Error('DOCX contains no extractable text');
    }

    logger.info('docx_text_extracted', {
      textLength: text.length,
    });

    return text;
  } catch (error: any) {
    logger.error('docx_extraction_error', { error: error.message });
    throw new Error(`Failed to extract text from DOCX: ${error.message}`);
  }
}

/**
 * Validate file size (max 10MB)
 */
export function validateFileSize(fileSize: number, maxSizeMB: number = 10): void {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (fileSize > maxSizeBytes) {
    throw new Error(`File size exceeds ${maxSizeMB}MB limit`);
  }
}

/**
 * Validate file type
 */
export function validateFileType(contentType: string, filename: string): void {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];

  const allowedExtensions = ['.pdf', '.docx', '.txt'];

  const hasValidType = allowedTypes.includes(contentType);
  const hasValidExtension = allowedExtensions.some(ext => filename.toLowerCase().endsWith(ext));

  if (!hasValidType && !hasValidExtension) {
    throw new Error('Invalid file type. Allowed: PDF, DOCX, TXT');
  }
}
