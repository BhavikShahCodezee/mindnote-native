// Shared physical ticket dimensions (Cat-Printer style).
// These are the sizes we want consistently across:
// - Settings preview UI
// - Image-to-bitmap conversion before printing

export const TICKET_WIDTH_MM = 57;
export const TICKET_HEIGHT_MM = 63;

// Settings UI uses a pixel canvas that historically mapped 57mm => 228px.
// Keep that mapping, but fix the height to 63mm.
export const SETTINGS_PREVIEW_WIDTH_PX = 228;
export const SETTINGS_PREVIEW_HEIGHT_PX = Math.round((TICKET_HEIGHT_MM / TICKET_WIDTH_MM) * SETTINGS_PREVIEW_WIDTH_PX); // 252px

