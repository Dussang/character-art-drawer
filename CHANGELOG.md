# Changelog

All notable changes to Character Art Drawer are documented in this file.

## [1.0.0] - 2026-07-08

### Added

- Initial Foundry VTT v13 module manifest.
- D&D 5e character sheet drawer integration.
- Actor avatar and prototype token art galleries.
- Per-actor image history stored in actor flags.
- Avatar image switching.
- Prototype token image switching.
- Optional automatic update of linked tokens on the active scene.
- Manual active scene token update button.
- Image add and soft delete controls.
- Optional hard delete mode with safety checks and active-image protection.
- Hidden delete button for the active image.
- Left-side drawer resizing.
- Client-side drawer size and last-mode persistence.
- English and Russian localization.
- Spanish, Brazilian Portuguese, French, Japanese, and Simplified Chinese localization.

### Known Limitations

- Foundry VTT v13 Build 351 does not expose a public file deletion API to modules, so hard delete cannot physically remove files in that version.
