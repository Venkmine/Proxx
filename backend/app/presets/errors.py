"""
Preset-specific error types.

All errors inherit from PresetValidationError for easy catching.
Errors are explicit and provide actionable messages.
"""


class PresetValidationError(Exception):
    """Base exception for all preset validation failures."""
    pass


class UnknownCategoryError(PresetValidationError):
    """Raised when a preset references an unknown category."""
    
    def __init__(self, category: str):
        self.category = category
        super().__init__(f"Unknown category: {category}")


class DuplicateCategoryError(PresetValidationError):
    """Raised when a global preset references the same category multiple times."""
    
    def __init__(self, category: str):
        self.category = category
        super().__init__(f"Duplicate category reference: {category}")


class MissingCategoryError(PresetValidationError):
    """Raised when a global preset is missing a required category."""
    
    def __init__(self, category: str):
        self.category = category
        super().__init__(f"Missing required category: {category}")


class PresetNotFoundError(PresetValidationError):
    """Raised when a referenced preset does not exist in the registry."""
    
    def __init__(self, category: str, preset_id: str):
        self.category = category
        self.preset_id = preset_id
        super().__init__(
            f"Preset not found: category={category}, id={preset_id}"
        )
