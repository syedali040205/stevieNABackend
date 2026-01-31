from openai import OpenAI, OpenAIError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from app.config.settings import settings
import structlog

logger = structlog.get_logger()

class OpenAIClient:
    """
    OpenAI client with retry logic and error handling.
    Implements exponential backoff for API failures.
    """
    
    def __init__(self):
        """Initialize OpenAI client with API key from settings"""
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")
        
        self.client = OpenAI(
            api_key=settings.openai_api_key,
            timeout=settings.openai_timeout
        )
        self.model = settings.openai_model
        self.embedding_model = settings.openai_embedding_model
        
        logger.info(
            "openai_client_initialized",
            model=self.model,
            embedding_model=self.embedding_model
        )
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(OpenAIError),
        reraise=True
    )
    async def chat_completion(
        self,
        messages: list,
        temperature: float = 0.7,
        max_tokens: int = 500
    ) -> str:
        """
        Call OpenAI chat completion API with retry logic.
        
        Args:
            messages: List of message dictionaries with role and content
            temperature: Sampling temperature (0-2)
            max_tokens: Maximum tokens in response
            
        Returns:
            str: The generated response text
            
        Raises:
            OpenAIError: If API call fails after retries
        """
        try:
            logger.info(
                "openai_chat_request",
                model=self.model,
                message_count=len(messages),
                temperature=temperature
            )
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            
            content = response.choices[0].message.content
            
            logger.info(
                "openai_chat_success",
                tokens_used=response.usage.total_tokens,
                response_length=len(content)
            )
            
            return content
            
        except OpenAIError as e:
            logger.error(
                "openai_chat_error",
                error=str(e),
                model=self.model
            )
            raise
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(OpenAIError),
        reraise=True
    )
    async def create_embedding(self, text: str) -> list[float]:
        """
        Generate embedding vector for text using OpenAI API.
        
        Args:
            text: Text to embed
            
        Returns:
            list[float]: Embedding vector (1536 dimensions for text-embedding-3-small)
            
        Raises:
            OpenAIError: If API call fails after retries
        """
        try:
            logger.info(
                "openai_embedding_request",
                model=self.embedding_model,
                text_length=len(text)
            )
            
            response = self.client.embeddings.create(
                model=self.embedding_model,
                input=text
            )
            
            embedding = response.data[0].embedding
            
            logger.info(
                "openai_embedding_success",
                dimension=len(embedding),
                tokens_used=response.usage.total_tokens
            )
            
            return embedding
            
        except OpenAIError as e:
            logger.error(
                "openai_embedding_error",
                error=str(e),
                model=self.embedding_model
            )
            raise

# Global client instance
openai_client = OpenAIClient()
