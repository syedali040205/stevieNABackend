from app.models.user_context import UserContext, Geography, OrganizationType, OrganizationSize, NominationSubject, OperatingScope, TechOrientation
from app.services.openai_client import openai_client
import structlog
import json
from typing import Dict, Any, Optional

logger = structlog.get_logger()

class FieldExtractor:
    """
    Extracts structured fields from user messages using LLM.
    Validates extracted fields against enum values and merges with existing context.
    """
    
    # Required fields for completeness
    REQUIRED_FIELDS = [
        "org_type",
        "org_size",
        "nomination_subject",
        "description",
        "achievement_focus"
    ]
    
    # Enum mappings for validation
    ENUM_MAPPINGS = {
        "geography": Geography,
        "org_type": OrganizationType,
        "org_size": OrganizationSize,
        "nomination_subject": NominationSubject,
        "operating_scope": OperatingScope,
        "tech_orientation": TechOrientation
    }
    
    def __init__(self):
        self.client = openai_client
    
    def _validate_enum_field(self, field_name: str, value: Any) -> Optional[str]:
        """
        Validate that a field value matches allowed enum values.
        
        Args:
            field_name: Name of the field
            value: Value to validate
            
        Returns:
            str: Validated enum value, or None if invalid
        """
        if field_name not in self.ENUM_MAPPINGS:
            return value
        
        enum_class = self.ENUM_MAPPINGS[field_name]
        
        # Try to match the value to an enum
        value_lower = str(value).lower().replace(" ", "_").replace("-", "_")
        
        for enum_member in enum_class:
            if enum_member.value == value_lower or enum_member.name.lower() == value_lower:
                return enum_member.value
        
        logger.warning(
            "invalid_enum_value",
            field=field_name,
            value=value,
            allowed_values=[e.value for e in enum_class]
        )
        return None
    
    def _check_completeness(self, context: UserContext) -> bool:
        """
        Check if all required fields have been collected.
        
        Args:
            context: User context to check
            
        Returns:
            bool: True if all required fields are present
        """
        context_dict = context.model_dump(exclude_none=True)
        
        for field in self.REQUIRED_FIELDS:
            if field not in context_dict or context_dict[field] is None:
                return False
        
        return True
    
    async def extract_fields(
        self,
        context: UserContext,
        user_message: str,
        conversation_state: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract structured fields from user message and update context.
        
        Args:
            context: Current user context
            user_message: User's response message
            conversation_state: Current conversation state
            
        Returns:
            dict: Contains extracted_fields, is_complete, and updated_context
        """
        logger.info(
            "extracting_fields",
            message_length=len(user_message),
            conversation_state=conversation_state
        )
        
        # Build context for extraction
        context_summary = self._build_context_summary(context)
        
        # Create prompt for field extraction
        system_prompt = """You are an AI assistant that extracts structured information from user messages.
Extract relevant fields from the user's message and return them as JSON.

Available fields and their allowed values:
- org_type: "for_profit", "non_profit", "government"
- org_size: "small" (up to 100 employees), "medium" (101-2,500), "large" (2,501+)
- nomination_subject: "organization", "team", "individual", "product"
- description: free text description of the achievement
- achievement_focus: array of ALL focus areas mentioned (e.g., ["Artificial Intelligence", "Machine Learning", "Innovation", "Customer Service"]). Extract EVERY achievement area, technology, or focus mentioned by the user. Be comprehensive.
- tech_orientation: "tech_company", "tech_user", "non_tech"
- operating_scope: "local", "regional", "national", "international"

IMPORTANT for achievement_focus:
- Extract ALL achievement areas, technologies, and focus areas mentioned
- Include specific technologies (AI, ML, blockchain, etc.)
- Include business areas (marketing, customer service, innovation, etc.)
- Include product/service areas mentioned
- Be thorough - don't miss any mentioned areas

Only extract fields that are clearly mentioned in the user's message.
Return a JSON object with the extracted fields. If no fields can be extracted, return an empty object {}."""
        
        user_prompt = f"""Current context:
{context_summary}

User message: "{user_message}"

Extract any relevant fields from this message. Return only valid JSON.

Extracted fields:"""
        
        try:
            # Call OpenAI to extract fields
            response = await self.client.chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,  # Lower temperature for more consistent extraction
                max_tokens=300
            )
            
            # Parse JSON response
            response = response.strip()
            # Remove markdown code blocks if present
            if response.startswith("```"):
                response = response.split("```")[1]
                if response.startswith("json"):
                    response = response[4:]
            response = response.strip()
            
            extracted_fields = json.loads(response)
            
            logger.info(
                "fields_extracted_raw",
                extracted_count=len(extracted_fields),
                fields=list(extracted_fields.keys())
            )
            
        except json.JSONDecodeError as e:
            logger.error("json_parse_error", error=str(e), response=response)
            extracted_fields = {}
        except Exception as e:
            logger.error("field_extraction_error", error=str(e))
            extracted_fields = {}
        
        # Validate and clean extracted fields
        validated_fields = {}
        for field_name, value in extracted_fields.items():
            if field_name in self.ENUM_MAPPINGS:
                validated_value = self._validate_enum_field(field_name, value)
                if validated_value:
                    validated_fields[field_name] = validated_value
            elif field_name == "achievement_focus":
                # Ensure achievement_focus is always an array
                if isinstance(value, list):
                    validated_fields[field_name] = value
                elif isinstance(value, str):
                    # Convert comma-separated string to array
                    validated_fields[field_name] = [v.strip() for v in value.split(",") if v.strip()]
                else:
                    validated_fields[field_name] = [str(value)]
            else:
                validated_fields[field_name] = value
        
        logger.info(
            "fields_validated",
            validated_count=len(validated_fields),
            fields=list(validated_fields.keys())
        )
        
        # Merge with existing context
        context_dict = context.model_dump(exclude_none=True)
        context_dict.update(validated_fields)
        
        # Fallback: If achievement_focus is still missing but we have a description, infer it
        if "achievement_focus" not in context_dict or not context_dict["achievement_focus"]:
            if "description" in context_dict and context_dict["description"]:
                # Infer achievement focus from description
                inferred_focus = self._infer_achievement_focus(context_dict["description"])
                if inferred_focus:
                    context_dict["achievement_focus"] = inferred_focus
                    logger.info("achievement_focus_inferred", focus=inferred_focus)
        
        # Create updated context
        updated_context = UserContext(**context_dict)
        
        # Check completeness
        is_complete = self._check_completeness(updated_context)
        
        logger.info(
            "extraction_complete",
            is_complete=is_complete,
            total_fields=len(context_dict)
        )
        
        return {
            "extracted_fields": validated_fields,
            "is_complete": is_complete,
            "updated_context": updated_context
        }
    
    def _build_context_summary(self, context: UserContext) -> str:
        """
        Build a summary of current context for the LLM.
        
        Args:
            context: Current user context
            
        Returns:
            str: Summary of known information
        """
        context_dict = context.model_dump(exclude_none=True)
        
        summary_parts = []
        for key, value in context_dict.items():
            if value is not None:
                summary_parts.append(f"{key}: {value}")
        
        return "\n".join(summary_parts) if summary_parts else "No information collected yet."
    
    def _infer_achievement_focus(self, description: str) -> list[str]:
        """
        Infer achievement focus areas from description text.
        
        Args:
            description: Achievement description
            
        Returns:
            list: Inferred focus areas
        """
        description_lower = description.lower()
        focus_areas = []
        
        # Common keywords to focus area mapping
        keywords_map = {
            "marketing": ["Marketing", "Brand Management"],
            "sales": ["Sales"],
            "customer service": ["Customer Service"],
            "innovation": ["Innovation"],
            "technology": ["Technology"],
            "ai": ["Artificial Intelligence"],
            "artificial intelligence": ["Artificial Intelligence"],
            "machine learning": ["Machine Learning"],
            "digital": ["Digital Transformation"],
            "leadership": ["Leadership"],
            "management": ["Management"],
            "product": ["Product Development"],
            "software": ["Software Development"],
            "data": ["Data Analytics"],
            "analytics": ["Data Analytics"],
            "cloud": ["Cloud Computing"],
            "cybersecurity": ["Cybersecurity"],
            "mobile": ["Mobile Technology"],
            "web": ["Web Development"],
            "ecommerce": ["E-commerce"],
            "social media": ["Social Media"],
            "content": ["Content Marketing"],
            "seo": ["SEO"],
            "advertising": ["Advertising"],
            "hr": ["Human Resources"],
            "finance": ["Finance"],
            "operations": ["Operations"],
            "supply chain": ["Supply Chain"],
            "logistics": ["Logistics"],
            "manufacturing": ["Manufacturing"],
            "healthcare": ["Healthcare"],
            "education": ["Education"],
            "sustainability": ["Sustainability"],
            "diversity": ["Diversity & Inclusion"],
        }
        
        for keyword, areas in keywords_map.items():
            if keyword in description_lower:
                focus_areas.extend(areas)
        
        # Remove duplicates and return
        return list(set(focus_areas)) if focus_areas else ["Business Excellence"]

# Global instance
field_extractor = FieldExtractor()
