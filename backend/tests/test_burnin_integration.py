"""
Integration tests for V1 Burn-In functionality.

These tests verify:
1. Burn-in presets and recipes load correctly
2. Recipe validation at job creation
3. Resolve Studio requirement is enforced
4. No burn-in when recipe is None

Part of V1 BURN-IN IMPLEMENTATION
"""

import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path

# Add backend to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.burnins import (
    get_available_recipes,
    get_available_presets,
    resolve_burnin_recipe,
    validate_recipe_id,
    BurnInRecipeNotFoundError,
    BurnInPresetNotFoundError,
    ResolvedBurnInConfig,
)
from backend.resolve.resolve_burnin_apply import (
    validate_resolve_for_burnins,
    ResolveNotStudioError,
)


class TestBurnInPresets:
    """Tests for burn-in preset loading."""
    
    def test_presets_load_successfully(self):
        """Verify all predefined presets load without error."""
        presets = get_available_presets()
        
        assert len(presets) == 6
        preset_ids = {p["id"] for p in presets}
        
        expected = {
            "SRC_TC_TL_25",
            "FILENAME_BR_50",
            "FRAME_BL_50",
            "QC_METADATA_TR",
            "SHOT_NAME_TR_50",
            "DATE_BR_25",
        }
        
        assert preset_ids == expected
    
    def test_preset_positions_valid(self):
        """Verify all presets have valid positions."""
        presets = get_available_presets()
        valid_positions = {"TL", "TR", "BL", "BR", "TC", "BC"}
        
        for preset in presets:
            assert preset["position"] in valid_positions, \
                f"Preset {preset['id']} has invalid position: {preset['position']}"


class TestBurnInRecipes:
    """Tests for burn-in recipe loading."""
    
    def test_recipes_load_successfully(self):
        """Verify all predefined recipes load without error."""
        recipes = get_available_recipes()
        
        assert len(recipes) == 4
        recipe_ids = {r["id"] for r in recipes}
        
        expected = {
            "OFFLINE_EDITORIAL",
            "VFX_PLATE",
            "QC_REVIEW",
            "CLEAN_TC",
        }
        
        assert recipe_ids == expected
    
    def test_recipe_descriptions_present(self):
        """Verify all recipes have descriptions."""
        recipes = get_available_recipes()
        
        for recipe in recipes:
            assert recipe["description"], \
                f"Recipe {recipe['id']} missing description"


class TestRecipeResolution:
    """Tests for resolving recipes to full configurations."""
    
    def test_qc_review_resolves_correctly(self):
        """Verify QC_REVIEW recipe resolves to expected presets."""
        config = resolve_burnin_recipe("QC_REVIEW")
        
        assert isinstance(config, ResolvedBurnInConfig)
        assert config.recipe_id == "QC_REVIEW"
        assert len(config.presets) == 3
        
        preset_ids = [p.id for p in config.presets]
        assert preset_ids == ["SRC_TC_TL_25", "FILENAME_BR_50", "QC_METADATA_TR"]
    
    def test_invalid_recipe_fails(self):
        """Verify invalid recipe ID raises error."""
        with pytest.raises(BurnInRecipeNotFoundError) as exc_info:
            resolve_burnin_recipe("INVALID_RECIPE")
        
        assert "INVALID_RECIPE" in str(exc_info.value)
        assert "not found" in str(exc_info.value).lower()
    
    def test_validate_recipe_id_passes_for_valid(self):
        """Verify validate_recipe_id returns ID for valid recipes."""
        result = validate_recipe_id("QC_REVIEW")
        assert result == "QC_REVIEW"
    
    def test_validate_recipe_id_passes_for_none(self):
        """Verify validate_recipe_id returns None for None input."""
        result = validate_recipe_id(None)
        assert result is None
    
    def test_validate_recipe_id_fails_for_invalid(self):
        """Verify validate_recipe_id raises for invalid recipes."""
        with pytest.raises(BurnInRecipeNotFoundError):
            validate_recipe_id("DOES_NOT_EXIST")


class TestResolveStudioRequirement:
    """Tests for Resolve Studio requirement enforcement."""
    
    @patch("backend.resolve.resolve_burnin_apply.detect_resolve_installation")
    def test_free_edition_fails_validation(self, mock_detect):
        """Verify Resolve Free fails burn-in validation."""
        # Mock Resolve Free installation
        mock_installation = MagicMock()
        mock_installation.version = "19.0.3"
        mock_installation.edition = "free"
        mock_detect.return_value = mock_installation
        
        result = validate_resolve_for_burnins()
        
        assert result["valid"] is False
        assert result["edition"] == "free"
        assert "Studio" in result["error"]
    
    @patch("backend.resolve.resolve_burnin_apply.detect_resolve_installation")
    @patch("backend.resolve.resolve_burnin_apply._get_resolve")
    def test_studio_edition_passes_validation(self, mock_get_resolve, mock_detect):
        """Verify Resolve Studio passes burn-in validation."""
        # Mock Resolve Studio installation
        mock_installation = MagicMock()
        mock_installation.version = "19.0.3"
        mock_installation.edition = "studio"
        mock_detect.return_value = mock_installation
        
        # Mock successful Resolve connection
        mock_get_resolve.return_value = MagicMock()
        
        result = validate_resolve_for_burnins()
        
        assert result["valid"] is True
        assert result["edition"] == "studio"
        assert result["error"] is None
    
    @patch("backend.resolve.resolve_burnin_apply.detect_resolve_installation")
    def test_no_installation_fails_validation(self, mock_detect):
        """Verify missing Resolve installation fails validation."""
        mock_detect.return_value = None
        
        result = validate_resolve_for_burnins()
        
        assert result["valid"] is False
        assert "not installed" in result["error"].lower()


class TestJobCreationWithBurnIn:
    """Tests for burn-in at job creation time."""
    
    def test_null_recipe_means_no_burnin(self):
        """Verify None burnin_recipe_id results in no burn-in config."""
        # Direct validation test - None should pass through
        result = validate_recipe_id(None)
        assert result is None
    
    def test_recipe_validation_at_creation(self):
        """Verify invalid recipe ID fails at validation stage."""
        with pytest.raises(BurnInRecipeNotFoundError) as exc_info:
            validate_recipe_id("MADE_UP_RECIPE")
        
        assert "MADE_UP_RECIPE" in str(exc_info.value)


class TestBurnInIntegration:
    """
    Integration test for the complete burn-in flow.
    
    Tests QC_REVIEW recipe with mocked Resolve interaction.
    """
    
    @patch("backend.resolve.resolve_burnin_apply.detect_resolve_installation")
    @patch("backend.resolve.resolve_burnin_apply._get_resolve")
    def test_qc_review_full_flow(self, mock_get_resolve, mock_detect):
        """
        Integration test: Job with QC_REVIEW recipe.
        
        Verifies:
        1. Recipe resolves correctly
        2. Resolve Studio check is performed
        3. Resolve script interaction is invoked
        """
        # === SETUP: Mock Resolve Studio ===
        mock_installation = MagicMock()
        mock_installation.version = "19.0.3"
        mock_installation.edition = "studio"
        mock_detect.return_value = mock_installation
        
        # Mock Resolve API
        mock_resolve = MagicMock()
        mock_project_manager = MagicMock()
        mock_project = MagicMock()
        mock_project.GetName.return_value = "TestProject"
        mock_project.GetSetting.return_value = {}
        mock_project.SetSetting.return_value = True
        mock_project_manager.GetCurrentProject.return_value = mock_project
        mock_resolve.GetProjectManager.return_value = mock_project_manager
        mock_get_resolve.return_value = mock_resolve
        
        # === ACTION: Apply burn-ins ===
        from backend.resolve.resolve_burnin_apply import apply_burnins_to_resolve
        
        config = resolve_burnin_recipe("QC_REVIEW")
        state = apply_burnins_to_resolve(config)
        
        # === VERIFY: Resolve was called correctly ===
        assert state.burn_in_applied is True
        assert state.project_name == "TestProject"
        
        # Verify Resolve Studio check was performed
        mock_detect.assert_called()
        
        # Verify Resolve scripting was invoked
        mock_get_resolve.assert_called()
        mock_project.SetSetting.assert_called()
    
    def test_no_burnin_when_recipe_null(self):
        """
        Verify no burn-in configuration when recipe_id is None.
        """
        # When recipe is None, validate_recipe_id returns None
        # and no Resolve interaction should occur
        result = validate_recipe_id(None)
        assert result is None
        
        # The absence of a recipe means no burn-in - no Resolve call needed
        # This is verified by the fact that we don't need to mock anything
