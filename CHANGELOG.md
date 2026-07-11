# Changelog

All notable changes to Character Art Drawer are documented in this file.

## [1.2.1] - 2026-07-11

### Fixed

- Fixed the Add image button on Foundry VTT v12, where the legacy FilePicker was not exposed through `globalThis`.

## [1.2.0] - 2026-07-11

### Added

- D&D 5e NPC sheet drawer integration.

## [1.1.0] - 2026-07-11

### Added

- Foundry VTT v12 Build 331 compatibility.
- D&D 5e v4.3.9 compatibility.

### Changed

- Replaced the drawer window implementation with the legacy Foundry `Application` API so the same module build can run on Foundry v12 and v13.
- Updated the module manifest compatibility range so Foundry v12/v13 are available with compatibility risk instead of verified status.
- Updated the D&D 5e relationship compatibility range so D&D 5e v4.x/v5.x are available without claiming verified status.
- Updated left-side resize handling to support both legacy and ApplicationV2 resize handles.

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
